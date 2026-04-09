import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import pkg from 'pg'
import { generators, Issuer } from 'openid-client'

const PORT = Number(process.env.API_PORT || process.env.PORT || 5178)
const DATABASE_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5176'

if (!DATABASE_URL) {
  throw new Error('Missing POSTGRES_URL or DATABASE_URL')
}

const { Pool } = pkg
const pool = new Pool({ connectionString: DATABASE_URL })

async function ensureSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text UNIQUE NOT NULL,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      tags text NOT NULL DEFAULT '[]',
      image_url text NOT NULL,
      shares_count int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, user_id)
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider text NOT NULL,
      provider_id text NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (provider, provider_id)
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

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '12mb' }))

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/register', async (req, res) => {
  await ensureSchema()
  const u = String(req.body?.username ?? '').trim()
  const e = String(req.body?.email ?? '').trim().toLowerCase()
  const p = String(req.body?.password ?? '')

  if (u.length < 3 || e.length < 5 || p.length < 6) return res.status(400).json({ error: 'invalid_input' })

  const passwordHash = await bcrypt.hash(p, 10)

  try {
    const created = await pool.query(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username`,
      [u, e, passwordHash]
    )
    const user = created.rows[0]
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    return res.json({ token, user })
  } catch {
    return res.status(409).json({ error: 'user_exists' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  await ensureSchema()
  const login = String(req.body?.emailOrUsername ?? '').trim()
  const p = String(req.body?.password ?? '')
  if (login.length < 3 || p.length < 6) return res.status(400).json({ error: 'invalid_input' })

  const isEmail = login.includes('@')
  const q = isEmail ? `SELECT id, username, password_hash FROM users WHERE email = $1 LIMIT 1` : `SELECT id, username, password_hash FROM users WHERE username = $1 LIMIT 1`
  const value = isEmail ? login.toLowerCase() : login
  const result = await pool.query(q, [value])
  const row = result.rows[0]
  if (!row) return res.status(401).json({ error: 'invalid_credentials' })

  const ok = await bcrypt.compare(p, String(row.password_hash))
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' })

  const user = { id: String(row.id), username: String(row.username) }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
  return res.json({ token, user })
})

async function findOrCreateOAuthUser({ provider, providerId, username, email }) {
  await ensureSchema()
  // Find by provider id
  let r = await pool.query(`SELECT u.id, u.username FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id WHERE oa.provider = $1 AND oa.provider_id = $2 LIMIT 1`, [provider, providerId])
  if (r.rowCount) return r.rows[0]
  // Create user
  let uname = (username || (email ? email.split('@')[0] : provider + '_' + providerId)).toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (uname.length < 3) uname = `${provider}${Math.floor(Math.random() * 10000)}`
  // Ensure unique username
  let suffix = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await pool.query(`SELECT 1 FROM users WHERE username = $1 LIMIT 1`, [uname])
    if (!exists.rowCount) break
    suffix += 1
    uname = `${uname}${suffix}`
  }
  const randomPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const passwordHash = await bcrypt.hash(randomPass, 10)
  const created = await pool.query(
    `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username`,
    [uname, email || `${provider}-${providerId}@example.invalid`, passwordHash]
  )
  const user = created.rows[0]
  await pool.query(
    `INSERT INTO oauth_accounts (provider, provider_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [provider, providerId, user.id]
  )
  return user
}

// GOOGLE OAUTH
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_ENABLED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
let googleClientPromise = null

async function getGoogleClient() {
  if (!GOOGLE_ENABLED) throw new Error('google_oauth_not_configured')
  if (!googleClientPromise) {
    const issuer = await Issuer.discover('https://accounts.google.com')
    const redirectUri = `http://127.0.0.1:${PORT}/api/oauth/google/callback`
    googleClientPromise = new issuer.Client({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uris: [redirectUri],
      response_types: ['code']
    })
  }
  return googleClientPromise
}

app.get('/api/oauth/google/start', async (_req, res) => {
  if (!GOOGLE_ENABLED) return res.status(501).json({ error: 'google_oauth_not_configured' })
  const client = await getGoogleClient()
  const url = client.authorizationUrl({
    scope: 'openid email profile',
    prompt: 'consent'
  })
  res.redirect(url)
})

app.get('/api/oauth/google/callback', async (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(501).json({ error: 'google_oauth_not_configured' })
  try {
    const client = await getGoogleClient()
    const params = client.callbackParams(req)
    const redirectUri = `http://127.0.0.1:${PORT}/api/oauth/google/callback`
    const tokenSet = await client.callback(redirectUri, params, {})
    const claims = tokenSet.claims()
    const providerId = String(claims.sub)
    const email = claims.email ? String(claims.email) : ''
    const name = claims.name ? String(claims.name) : ''
    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId,
      username: name || email.split('@')[0],
      email
    })
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    res.redirect(`${FRONTEND_ORIGIN}/intereses?token=${encodeURIComponent(token)}`)
  } catch (e) {
    res.status(500).send('oauth_failed')
  }
})

// INSTAGRAM OAUTH (Basic Display)
const IG_CLIENT_ID = process.env.IG_CLIENT_ID || ''
const IG_CLIENT_SECRET = process.env.IG_CLIENT_SECRET || ''
const IG_REDIRECT_URI = process.env.IG_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/oauth/instagram/callback`
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
    res.redirect(`${FRONTEND_ORIGIN}/intereses?token=${encodeURIComponent(token)}`)
  } catch (e) {
    res.status(500).send('oauth_failed')
  }
})

// APPLE OAUTH (requiere configuración y client secret válido)
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || ''
const APPLE_CLIENT_SECRET = process.env.APPLE_CLIENT_SECRET || '' // Generado desde tu cuenta de Apple
const APPLE_ENABLED = Boolean(APPLE_CLIENT_ID && APPLE_CLIENT_SECRET)
let appleClientPromise = null

async function getAppleClient() {
  if (!APPLE_ENABLED) throw new Error('apple_oauth_not_configured')
  if (!appleClientPromise) {
    const issuer = await Issuer.discover('https://appleid.apple.com')
    const redirectUri = `http://127.0.0.1:${PORT}/api/oauth/apple/callback`
    appleClientPromise = new issuer.Client({
      client_id: APPLE_CLIENT_ID,
      client_secret: APPLE_CLIENT_SECRET,
      redirect_uris: [redirectUri],
      response_types: ['code']
    })
  }
  return appleClientPromise
}

app.get('/api/oauth/apple/start', async (_req, res) => {
  if (!APPLE_ENABLED) return res.status(501).json({ error: 'apple_oauth_not_configured' })
  const client = await getAppleClient()
  const url = client.authorizationUrl({
    scope: 'name email'
  })
  res.redirect(url)
})

app.get('/api/oauth/apple/callback', async (req, res) => {
  if (!APPLE_ENABLED) return res.status(501).json({ error: 'apple_oauth_not_configured' })
  try {
    const client = await getAppleClient()
    const params = client.callbackParams(req)
    const redirectUri = `http://127.0.0.1:${PORT}/api/oauth/apple/callback`
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
    res.redirect(`${FRONTEND_ORIGIN}/intereses?token=${encodeURIComponent(token)}`)
  } catch (e) {
    res.status(500).send('oauth_failed')
  }
})

app.get('/api/posts', async (req, res) => {
  await ensureSchema()
  const auth = getAuthUser(req)
  const userId = auth?.id ?? null

  const postsResult = await pool.query(
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
    const commentsResult = await pool.query(
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
    imageUrl: r.image_url,
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
  const user = requireAuth(req, res)
  if (!user) return

  const title = String(req.body?.title ?? '').trim()
  const tags = normalizeTags(req.body?.tags)
  const imageUrl = String(req.body?.imageUrl ?? '')
  if (title.length < 1 || title.length > 80) return res.status(400).json({ error: 'invalid_title' })
  if (!imageUrl) return res.status(400).json({ error: 'missing_image' })

  const inserted = await pool.query(
    `INSERT INTO posts (user_id, title, tags, image_url) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [user.id, title, JSON.stringify(tags), imageUrl]
  )
  const row = inserted.rows[0]
  res.json({
    post: {
      id: row.id,
      author: user.username,
      title,
      tags,
      imageUrl,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      likedByMe: false,
      previewComments: [],
      createdAt: row.created_at
    }
  })
})

app.post('/api/posts/:id/like', async (req, res) => {
  await ensureSchema()
  const user = requireAuth(req, res)
  if (!user) return
  const postId = String(req.params.id)

  const existing = await pool.query(`SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2 LIMIT 1`, [postId, user.id])
  if (existing.rowCount) {
    await pool.query(`DELETE FROM likes WHERE post_id = $1 AND user_id = $2`, [postId, user.id])
  } else {
    await pool.query(`INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, user.id])
  }

  const likesCountResult = await pool.query(`SELECT count(*)::int as c FROM likes WHERE post_id = $1`, [postId])
  const likesCount = likesCountResult.rows[0]?.c ?? 0
  const likedByMe = !existing.rowCount
  res.json({ likesCount, likedByMe })
})

app.post('/api/posts/:id/comments', async (req, res) => {
  await ensureSchema()
  const user = requireAuth(req, res)
  if (!user) return
  const postId = String(req.params.id)
  const text = String(req.body?.text ?? '').trim()
  if (text.length < 1 || text.length > 500) return res.status(400).json({ error: 'invalid_comment' })

  const created = await pool.query(
    `INSERT INTO comments (post_id, user_id, text) VALUES ($1, $2, $3) RETURNING id, created_at`,
    [postId, user.id, text]
  )
  const row = created.rows[0]
  const commentsCountResult = await pool.query(`SELECT count(*)::int as c FROM comments WHERE post_id = $1`, [postId])
  const commentsCount = commentsCountResult.rows[0]?.c ?? 0
  res.json({ comment: { id: row.id, author: user.username, text, createdAt: row.created_at }, commentsCount })
})

app.post('/api/posts/:id/share', async (req, res) => {
  await ensureSchema()
  const postId = String(req.params.id)
  const updated = await pool.query(
    `UPDATE posts SET shares_count = shares_count + 1 WHERE id = $1 RETURNING shares_count`,
    [postId]
  )
  const sharesCount = updated.rows[0]?.shares_count ?? 0
  res.json({ sharesCount })
})

app.listen(PORT, () => {
  process.stdout.write(`api listening on http://127.0.0.1:${PORT}\n`)
})
