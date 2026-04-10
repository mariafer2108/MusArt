import 'dotenv/config'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import pkg from 'pg'
import { handleUpload } from '@vercel/blob'

const { Pool } = pkg

const DATABASE_URL =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  ''
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5176'

let pool = null

function getPool() {
  if (!DATABASE_URL) return null
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL })
  return pool
}

function getApiOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http')
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1')
  return `${proto}://${host}`
}

async function ensureSchema() {
  const p = getPool()
  if (!p) throw new Error('db_not_configured')

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      username text UNIQUE NOT NULL,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      tags text NOT NULL DEFAULT '[]',
      image_url text NOT NULL,
      media_url text,
      media_type text,
      shares_count int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await p.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_url text;`)
  await p.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type text;`)
  await p.query(`UPDATE posts SET media_url = image_url WHERE media_url IS NULL;`)
  await p.query(`UPDATE posts SET media_type = 'image' WHERE media_type IS NULL;`)
  await p.query(`
    CREATE TABLE IF NOT EXISTS likes (
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, user_id)
    );
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id uuid PRIMARY KEY,
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider text NOT NULL,
      provider_id text NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (provider, provider_id)
    );
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS user_interests (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      interest text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, interest)
    );
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (follower_id, followee_id)
    );
  `)
}

function getAuthUser(req) {
  const header = req.header('authorization')
  if (!header) return null
  const [kind, token] = String(header).split(' ')
  if (kind !== 'Bearer' || !token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (!payload?.id || !payload?.username) return null
    return { id: String(payload.id), username: String(payload.username) }
  } catch {
    return null
  }
}

function requireAuth(req, res) {
  const user = getAuthUser(req)
  if (!user) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  return user
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 12)
}

function normalizeInterests(interests) {
  if (!Array.isArray(interests)) return []
  return interests
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 12)
}

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '12mb' }))
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) return next()
  req.url = `/api${req.url}`
  return next()
})

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, dbConfigured: Boolean(DATABASE_URL) })
})

app.post('/api/blob/upload', async (req, res) => {
  const authHeader = req.header('authorization') || (req.query?.auth ? `Bearer ${String(req.query.auth)}` : '')
  if (authHeader && !req.header('authorization')) req.headers['authorization'] = authHeader
  const user = requireAuth(req, res)
  if (!user) return

  const response = await handleUpload({
    request: req,
    body: req.body,
    onBeforeGenerateToken: async (_pathname) => {
      return {
        addRandomSuffix: true,
        allowedContentTypes: ['image/*', 'video/*'],
        maximumSizeInBytes: 300 * 1024 * 1024
      }
    },
    onUploadCompleted: async () => {}
  })

  res.status(response.status)
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.send(await response.text())
})

app.post('/api/auth/register', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const u = String(req.body?.username ?? '').trim()
  const e = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  if (u.length < 3 || e.length < 5 || password.length < 6) return res.status(400).json({ error: 'invalid_input' })
  const passwordHash = await bcrypt.hash(password, 10)
  const id = crypto.randomUUID()
  try {
    const created = await db.query(
      `INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username`,
      [id, u, e, passwordHash]
    )
    const user = created.rows[0]
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, user })
  } catch {
    res.status(409).json({ error: 'user_exists' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const login = String(req.body?.emailOrUsername ?? '').trim()
  const password = String(req.body?.password ?? '')
  if (login.length < 3 || password.length < 6) return res.status(400).json({ error: 'invalid_input' })
  const isEmail = login.includes('@')
  const q = isEmail ? `SELECT id, username, password_hash FROM users WHERE email = $1 LIMIT 1` : `SELECT id, username, password_hash FROM users WHERE username = $1 LIMIT 1`
  const value = isEmail ? login.toLowerCase() : login
  const result = await db.query(q, [value])
  const row = result.rows[0]
  if (!row) return res.status(401).json({ error: 'invalid_credentials' })
  const ok = await bcrypt.compare(password, String(row.password_hash))
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' })
  const user = { id: String(row.id), username: String(row.username) }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user })
})

app.get('/api/users', async (_req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const result = await db.query(`SELECT username FROM users ORDER BY created_at DESC LIMIT 50`)
  res.json({ users: result.rows.map((r) => ({ username: r.username })) })
})

app.get('/api/me', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const interestsResult = await db.query(`SELECT interest FROM user_interests WHERE user_id = $1 ORDER BY interest ASC`, [user.id])
  const followingResult = await db.query(
    `
      SELECT u.username
      FROM follows f
      JOIN users u ON u.id = f.followee_id
      WHERE f.follower_id = $1
      ORDER BY u.username ASC
    `,
    [user.id]
  )
  res.json({
    user,
    interests: interestsResult.rows.map((r) => r.interest),
    following: followingResult.rows.map((r) => r.username)
  })
})

app.get('/api/me/interests', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return
  const interestsResult = await db.query(`SELECT interest FROM user_interests WHERE user_id = $1 ORDER BY interest ASC`, [user.id])
  res.json({ interests: interestsResult.rows.map((r) => r.interest) })
})

app.put('/api/me/interests', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const interests = normalizeInterests(req.body?.interests)
  await db.query(`DELETE FROM user_interests WHERE user_id = $1`, [user.id])
  for (const interest of interests) {
    await db.query(`INSERT INTO user_interests (user_id, interest) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, interest])
  }
  res.json({ interests })
})

app.get('/api/me/following', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return
  const followingResult = await db.query(
    `
      SELECT u.username
      FROM follows f
      JOIN users u ON u.id = f.followee_id
      WHERE f.follower_id = $1
      ORDER BY u.username ASC
    `,
    [user.id]
  )
  res.json({ following: followingResult.rows.map((r) => r.username) })
})

app.post('/api/follow/:username/toggle', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const username = String(req.params.username || '').trim()
  if (!username) return res.status(400).json({ error: 'invalid_username' })
  const target = await db.query(`SELECT id, username FROM users WHERE username = $1 LIMIT 1`, [username])
  if (!target.rowCount) return res.status(404).json({ error: 'not_found' })
  const followeeId = String(target.rows[0].id)
  if (followeeId === user.id) return res.status(400).json({ error: 'cannot_follow_self' })

  const existing = await db.query(`SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2 LIMIT 1`, [user.id, followeeId])
  if (existing.rowCount) {
    await db.query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [user.id, followeeId])
    return res.json({ following: false })
  }
  await db.query(`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, followeeId])
  return res.json({ following: true })
})

async function findOrCreateOAuthUser({ provider, providerId, username, email }) {
  await ensureSchema()
  const db = getPool()
  if (!db) throw new Error('db_not_configured')
  let r = await db.query(`SELECT u.id, u.username FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id WHERE oa.provider = $1 AND oa.provider_id = $2 LIMIT 1`, [provider, providerId])
  if (r.rowCount) return r.rows[0]
  let uname = (username || (email ? email.split('@')[0] : provider + '_' + providerId)).toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (uname.length < 3) uname = `${provider}${Math.floor(Math.random() * 10000)}`
  let suffix = 0
  while (true) {
    const exists = await db.query(`SELECT 1 FROM users WHERE username = $1 LIMIT 1`, [uname])
    if (!exists.rowCount) break
    suffix += 1
    uname = `${uname}${suffix}`
  }
  const randomPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const passwordHash = await bcrypt.hash(randomPass, 10)
  const id = crypto.randomUUID()
  const created = await db.query(
    `INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username`,
    [id, uname, email || `${provider}-${providerId}@example.invalid`, passwordHash]
  )
  const user = created.rows[0]
  await db.query(
    `INSERT INTO oauth_accounts (provider, provider_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [provider, providerId, user.id]
  )
  return user
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_ENABLED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
const GOOGLE_PKCE = process.env.GOOGLE_PKCE ? process.env.GOOGLE_PKCE !== '0' : true
function base64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

app.get('/api/oauth/google/start', async (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(501).json({ error: 'google_oauth_not_configured' })
  const apiOrigin = getApiOrigin(req)
  const redirectUri = `${apiOrigin}/api/oauth/google/callback`
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('prompt', 'consent')
  if (GOOGLE_PKCE) {
    const codeVerifier = base64Url(crypto.randomBytes(32))
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest())
    const state = jwt.sign({ p: 'google', cv: codeVerifier }, JWT_SECRET, { expiresIn: '10m' })
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('state', state)
  }
  res.redirect(url.toString())
})

app.get('/api/oauth/google/callback', async (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(501).json({ error: 'google_oauth_not_configured' })
  try {
    const apiOrigin = getApiOrigin(req)
    const redirectUri = `${apiOrigin}/api/oauth/google/callback`
    const code = String(req.query.code || '')
    const state = String(req.query.state || '')
    let codeVerifier = ''
    if (state) {
      try {
        const decoded = jwt.verify(state, JWT_SECRET)
        if (decoded && decoded.p === 'google' && decoded.cv) codeVerifier = String(decoded.cv)
      } catch {}
    }
    const body = new URLSearchParams()
    body.set('client_id', GOOGLE_CLIENT_ID)
    body.set('client_secret', GOOGLE_CLIENT_SECRET)
    body.set('grant_type', 'authorization_code')
    body.set('code', code)
    body.set('redirect_uri', redirectUri)
    if (codeVerifier) body.set('code_verifier', codeVerifier)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    const tokenData = await tokenRes.json()
    const accessToken = String(tokenData.access_token || '')
    if (!accessToken) return res.status(400).send('oauth_failed')
    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const userData = await userRes.json()
    const providerId = String(userData.sub || '')
    const email = userData.email ? String(userData.email) : ''
    const name = userData.name ? String(userData.name) : ''
    if (!providerId) return res.status(400).send('oauth_failed')
    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId,
      username: name || email.split('@')[0],
      email
    })
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    const frontendOrigin = process.env.FRONTEND_ORIGIN || apiOrigin
    const db = getPool()
    const hasInterestsResult = db ? await db.query(`SELECT 1 FROM user_interests WHERE user_id = $1 LIMIT 1`, [user.id]) : { rowCount: 0 }
    const hasInterests = Boolean(hasInterestsResult.rowCount)
    const nextPath = hasInterests ? '/app' : '/intereses'
    res.redirect(`${frontendOrigin}${nextPath}?token=${encodeURIComponent(token)}`)
  } catch {
    res.status(500).send('oauth_failed')
  }
})

const IG_CLIENT_ID = process.env.IG_CLIENT_ID || ''
const IG_CLIENT_SECRET = process.env.IG_CLIENT_SECRET || ''
const IG_REDIRECT_URI = process.env.IG_REDIRECT_URI || `http://127.0.0.1:${process.env.API_PORT || process.env.PORT || 5178}/api/oauth/instagram/callback`
const IG_ENABLED = Boolean(IG_CLIENT_ID && IG_CLIENT_SECRET)

app.get('/api/oauth/instagram/start', (req, res) => {
  if (!IG_ENABLED) return res.status(501).json({ error: 'instagram_oauth_not_configured' })
  const url = new URL('https://api.instagram.com/oauth/authorize')
  url.searchParams.set('client_id', IG_CLIENT_ID)
  url.searchParams.set('redirect_uri', IG_REDIRECT_URI)
  url.searchParams.set('scope', 'user_profile')
  url.searchParams.set('response_type', 'code')
  res.redirect(url.toString())
})

app.get('/api/oauth/instagram/callback', async (req, res) => {
  if (!IG_ENABLED) return res.status(501).json({ error: 'instagram_oauth_not_configured' })
  try {
    const apiOrigin = getApiOrigin(req)
    const code = String(req.query.code || '')
    const params = new URLSearchParams()
    params.set('client_id', IG_CLIENT_ID)
    params.set('client_secret', IG_CLIENT_SECRET)
    params.set('grant_type', 'authorization_code')
    params.set('redirect_uri', IG_REDIRECT_URI)
    params.set('code', code)
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    })
    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token
    const userRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`)
    const userData = await userRes.json()
    const providerId = String(userData.id)
    const username = String(userData.username || 'instagram_user')
    const user = await findOrCreateOAuthUser({
      provider: 'instagram',
      providerId,
      username,
      email: ''
    })
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    const frontendOrigin = process.env.FRONTEND_ORIGIN || apiOrigin
    const db = getPool()
    const hasInterestsResult = db ? await db.query(`SELECT 1 FROM user_interests WHERE user_id = $1 LIMIT 1`, [user.id]) : { rowCount: 0 }
    const hasInterests = Boolean(hasInterestsResult.rowCount)
    const nextPath = hasInterests ? '/app' : '/intereses'
    res.redirect(`${frontendOrigin}${nextPath}?token=${encodeURIComponent(token)}`)
  } catch {
    res.status(500).send('oauth_failed')
  }
})

const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || ''
const APPLE_CLIENT_SECRET = process.env.APPLE_CLIENT_SECRET || ''
const APPLE_ENABLED = Boolean(APPLE_CLIENT_ID && APPLE_CLIENT_SECRET)
let appleIssuerPromise = null

async function getAppleIssuer() {
  if (!appleIssuerPromise) {
    appleIssuerPromise = import('openid-client').then(({ Issuer }) => Issuer.discover('https://appleid.apple.com'))
  }
  return appleIssuerPromise
}

async function getAppleClient(apiOrigin) {
  if (!APPLE_ENABLED) throw new Error('apple_oauth_not_configured')
  const issuer = await getAppleIssuer()
  const redirectUri = `${apiOrigin}/api/oauth/apple/callback`
  return new issuer.Client({
    client_id: APPLE_CLIENT_ID,
    client_secret: APPLE_CLIENT_SECRET,
    redirect_uris: [redirectUri],
    response_types: ['code']
  })
}

app.get('/api/oauth/apple/start', async (req, res) => {
  if (!APPLE_ENABLED) return res.status(501).json({ error: 'apple_oauth_not_configured' })
  const apiOrigin = getApiOrigin(req)
  const client = await getAppleClient(apiOrigin)
  const url = client.authorizationUrl({ scope: 'name email' })
  res.redirect(url)
})

app.get('/api/oauth/apple/callback', async (req, res) => {
  if (!APPLE_ENABLED) return res.status(501).json({ error: 'apple_oauth_not_configured' })
  try {
    const apiOrigin = getApiOrigin(req)
    const client = await getAppleClient(apiOrigin)
    const params = client.callbackParams(req)
    const redirectUri = `${apiOrigin}/api/oauth/apple/callback`
    const tokenSet = await client.callback(redirectUri, params, {})
    const claims = tokenSet.claims()
    const providerId = String(claims.sub)
    const email = claims.email ? String(claims.email) : ''
    const name = claims.name ? String(claims.name) : ''
    const user = await findOrCreateOAuthUser({
      provider: 'apple',
      providerId,
      username: name || email.split('@')[0] || 'apple_user',
      email
    })
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    const frontendOrigin = process.env.FRONTEND_ORIGIN || apiOrigin
    const db = getPool()
    const hasInterestsResult = db ? await db.query(`SELECT 1 FROM user_interests WHERE user_id = $1 LIMIT 1`, [user.id]) : { rowCount: 0 }
    const hasInterests = Boolean(hasInterestsResult.rowCount)
    const nextPath = hasInterests ? '/app' : '/intereses'
    res.redirect(`${frontendOrigin}${nextPath}?token=${encodeURIComponent(token)}`)
  } catch {
    res.status(500).send('oauth_failed')
  }
})

app.get('/api/posts', async (req, res) => {
  await ensureSchema()
  const p = getPool()
  if (!p) return res.status(500).json({ error: 'db_not_configured' })
  const auth = getAuthUser(req)
  const userId = auth?.id ?? null
  const postsResult = await p.query(
    `
      SELECT
        p.id,
        p.title,
        p.tags,
        COALESCE(p.media_url, p.image_url) as media_url,
        COALESCE(p.media_type, 'image') as media_type,
        p.shares_count,
        p.created_at,
        u.username as author,
        (SELECT count(*)::int FROM likes l WHERE l.post_id = p.id) as likes_count,
        (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) as comments_count,
        CASE WHEN $1::uuid IS NULL THEN false
          ELSE EXISTS (SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $1::uuid)
        END as liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 50
    `,
    [userId]
  )
  const postIds = postsResult.rows.map((r) => r.id)
  const commentsByPost = new Map()
  if (postIds.length) {
    const commentsResult = await p.query(
      `
        SELECT c.id, c.post_id, c.text, c.created_at, u.username as author
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.post_id = ANY($1::uuid[])
        ORDER BY c.created_at DESC
      `,
      [postIds]
    )
    for (const c of commentsResult.rows) {
      const list = commentsByPost.get(c.post_id) ?? []
      if (list.length < 5) list.push({ id: c.id, author: c.author, text: c.text, createdAt: c.created_at })
      commentsByPost.set(c.post_id, list)
    }
  }
  const posts = postsResult.rows.map((r) => ({
    id: r.id,
    author: r.author,
    title: r.title,
    tags: JSON.parse(r.tags || '[]'),
    mediaUrl: r.media_url,
    mediaType: r.media_type,
    likesCount: r.likes_count,
    commentsCount: r.comments_count,
    sharesCount: r.shares_count,
    likedByMe: r.liked_by_me,
    previewComments: commentsByPost.get(r.id) ?? [],
    createdAt: r.created_at
  }))
  res.json({ posts })
})

app.post('/api/posts', async (req, res) => {
  await ensureSchema()
  const p = getPool()
  if (!p) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return
  const title = String(req.body?.title ?? '').trim()
  const tags = normalizeTags(req.body?.tags)
  const mediaUrl = String(req.body?.mediaUrl ?? req.body?.imageUrl ?? '')
  const mediaType = String(req.body?.mediaType ?? (String(req.body?.imageUrl ?? '').startsWith('data:video') ? 'video' : 'image')).toLowerCase()
  if (title.length < 1 || title.length > 80) return res.status(400).json({ error: 'invalid_title' })
  if (!mediaUrl) return res.status(400).json({ error: 'missing_media' })
  if (mediaType !== 'image' && mediaType !== 'video') return res.status(400).json({ error: 'invalid_media_type' })
  const id = crypto.randomUUID()
  const inserted = await p.query(
    `INSERT INTO posts (id, user_id, title, tags, image_url, media_url, media_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [id, user.id, title, JSON.stringify(tags), mediaUrl, mediaUrl, mediaType]
  )
  const row = inserted.rows[0]
  res.json({
    post: {
      id: row.id,
      author: user.username,
      title,
      tags,
      mediaUrl,
      mediaType,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      likedByMe: false,
      previewComments: [],
      createdAt: row.created_at
    }
  })
})

app.patch('/api/posts/:id', async (req, res) => {
  await ensureSchema()
  const p = getPool()
  if (!p) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const postId = String(req.params.id)
  const title = String(req.body?.title ?? '').trim()
  const tags = normalizeTags(req.body?.tags)

  if (title.length < 1 || title.length > 80) return res.status(400).json({ error: 'invalid_title' })

  const owner = await p.query(`SELECT user_id FROM posts WHERE id = $1 LIMIT 1`, [postId])
  if (!owner.rowCount) return res.status(404).json({ error: 'not_found' })
  if (String(owner.rows[0].user_id) !== user.id) return res.status(403).json({ error: 'forbidden' })

  await p.query(`UPDATE posts SET title = $2, tags = $3 WHERE id = $1`, [postId, title, JSON.stringify(tags)])

  const postResult = await p.query(
    `
      SELECT
        p.id,
        p.title,
        p.tags,
        p.image_url,
        p.shares_count,
        p.created_at,
        u.username as author,
        (SELECT count(*)::int FROM likes l WHERE l.post_id = p.id) as likes_count,
        (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) as comments_count,
        EXISTS (SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $2::uuid) as liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = $1
      LIMIT 1
    `,
    [postId, user.id]
  )
  const row = postResult.rows[0]

  const commentsResult = await p.query(
    `
      SELECT c.id, c.post_id, c.text, c.created_at, u.username as author
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = $1
      ORDER BY c.created_at DESC
      LIMIT 5
    `,
    [postId]
  )
  const previewComments = commentsResult.rows.map((c) => ({ id: c.id, author: c.author, text: c.text, createdAt: c.created_at }))

  res.json({
    post: {
      id: row.id,
      author: row.author,
      title: row.title,
      tags: JSON.parse(row.tags || '[]'),
      mediaUrl: row.media_url,
      mediaType: row.media_type,
      likesCount: row.likes_count,
      commentsCount: row.comments_count,
      sharesCount: row.shares_count,
      likedByMe: row.liked_by_me,
      previewComments,
      createdAt: row.created_at
    }
  })
})

app.post('/api/posts/:id/like', async (req, res) => {
  await ensureSchema()
  const p = getPool()
  if (!p) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return
  const postId = String(req.params.id)
  const existing = await p.query(`SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2 LIMIT 1`, [postId, user.id])
  if (existing.rowCount) {
    await p.query(`DELETE FROM likes WHERE post_id = $1 AND user_id = $2`, [postId, user.id])
  } else {
    await p.query(`INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, user.id])
  }
  const likesCountResult = await p.query(`SELECT count(*)::int as c FROM likes WHERE post_id = $1`, [postId])
  const likesCount = likesCountResult.rows[0]?.c ?? 0
  const likedByMe = !existing.rowCount
  res.json({ likesCount, likedByMe })
})

app.post('/api/posts/:id/comments', async (req, res) => {
  await ensureSchema()
  const p = getPool()
  if (!p) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return
  const postId = String(req.params.id)
  const text = String(req.body?.text ?? '').trim()
  if (text.length < 1 || text.length > 500) return res.status(400).json({ error: 'invalid_comment' })
  const id = crypto.randomUUID()
  const created = await p.query(
    `INSERT INTO comments (id, post_id, user_id, text) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [id, postId, user.id, text]
  )
  const row = created.rows[0]
  const commentsCountResult = await p.query(`SELECT count(*)::int as c FROM comments WHERE post_id = $1`, [postId])
  const commentsCount = commentsCountResult.rows[0]?.c ?? 0
  res.json({ comment: { id: row.id, author: user.username, text, createdAt: row.created_at }, commentsCount })
})

app.post('/api/posts/:id/share', async (req, res) => {
  await ensureSchema()
  const p = getPool()
  if (!p) return res.status(500).json({ error: 'db_not_configured' })
  const postId = String(req.params.id)
  const updated = await p.query(
    `UPDATE posts SET shares_count = shares_count + 1 WHERE id = $1 RETURNING shares_count`,
    [postId]
  )
  const sharesCount = updated.rows[0]?.shares_count ?? 0
  res.json({ sharesCount })
})

export default app
