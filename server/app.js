import 'dotenv/config'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import pkg from 'pg'
import { handleUpload } from '@vercel/blob/client'

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
      avatar_url text,
      bio text,
      accepts_commissions boolean NOT NULL DEFAULT false,
      commission_categories text NOT NULL DEFAULT '[]',
      commission_price_info text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;`)
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;`)
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_commissions boolean NOT NULL DEFAULT false;`)
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_categories text NOT NULL DEFAULT '[]';`)
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_price_info text NOT NULL DEFAULT '';`)
  await p.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      tags text NOT NULL DEFAULT '[]',
      image_url text NOT NULL,
      media_url text,
      media_type text,
      shares_count int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await p.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';`)
  await p.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_url text;`)
  await p.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type text;`)
  await p.query(`UPDATE posts SET media_url = image_url WHERE media_url IS NULL;`)
  await p.query(`UPDATE posts SET media_type = 'image' WHERE media_type IS NULL;`)
  await p.query(`UPDATE posts SET description = '' WHERE description IS NULL;`)
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

  await p.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id uuid PRIMARY KEY,
      user1_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user1_id, user2_id)
    );
  `)
  await p.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id);`)
  await p.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id);`)

  await p.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await p.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);`)

  await p.query(`
    CREATE TABLE IF NOT EXISTS commission_requests (
      id uuid PRIMARY KEY,
      requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      details text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await p.query(`CREATE INDEX IF NOT EXISTS idx_commission_requests_artist ON commission_requests(artist_id, created_at DESC);`)
  await p.query(`CREATE INDEX IF NOT EXISTS idx_commission_requests_requester ON commission_requests(requester_id, created_at DESC);`)
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

function normalizeCommissionCategories(categories) {
  if (!Array.isArray(categories)) return []
  return categories
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 12)
}

function safeJsonArrayText(value) {
  try {
    const arr = JSON.parse(String(value || '[]'))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function orderUserIds(a, b) {
  const aS = String(a)
  const bS = String(b)
  return aS < bS ? [aS, bS] : [bS, aS]
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
  res.json({
    ok: true,
    dbConfigured: Boolean(DATABASE_URL),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    adminConfigured: Boolean(process.env.ADMIN_SECRET),
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA || null
  })
})

app.post('/api/blob/upload', async (req, res) => {
  try {
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (_pathname) => {
        const bearer = String(req.header('authorization') || '')
        const tokenFromBearer = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : ''
        try {
          const payload = jwt.verify(tokenFromBearer, JWT_SECRET)
          if (!payload?.id || !payload?.username) throw new Error('unauthorized')
          return {
            addRandomSuffix: true,
            allowedContentTypes: ['image/*', 'video/*'],
            maximumSizeInBytes: 300 * 1024 * 1024,
            tokenPayload: String(payload.id)
          }
        } catch {
          throw new Error('unauthorized')
        }
      },
      onUploadCompleted: async () => {}
    })

    return res.json(result)
  } catch (e) {
    const msg = typeof e?.message === 'string' ? e.message : 'upload_failed'
    const code = msg === 'unauthorized' ? 401 : 400
    return res.status(code).json({ error: msg })
  }
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
      `INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, avatar_url, bio`,
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
  const q = isEmail
    ? `SELECT id, username, password_hash, avatar_url, bio FROM users WHERE email = $1 LIMIT 1`
    : `SELECT id, username, password_hash, avatar_url, bio FROM users WHERE username = $1 LIMIT 1`
  const value = isEmail ? login.toLowerCase() : login
  const result = await db.query(q, [value])
  const row = result.rows[0]
  if (!row) return res.status(401).json({ error: 'invalid_credentials' })
  const ok = await bcrypt.compare(password, String(row.password_hash))
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' })
  const user = { id: String(row.id), username: String(row.username), avatarUrl: row.avatar_url || null, bio: row.bio || '' }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user })
})

app.post('/api/auth/set-password', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const password = String(req.body?.password ?? '')
  if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'invalid_password' })
  const passwordHash = await bcrypt.hash(password, 10)
  await db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, passwordHash])
  res.json({ ok: true })
})

app.delete('/api/admin/users/:username', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })

  const adminSecret = process.env.ADMIN_SECRET || ''
  if (!adminSecret) return res.status(501).json({ error: 'admin_not_configured' })

  const provided = String(req.header('x-admin-secret') || req.query?.secret || '')
  if (provided !== adminSecret) return res.status(401).json({ error: 'unauthorized' })

  const username = String(req.params.username || '').trim()
  if (!username) return res.status(400).json({ error: 'invalid_username' })

  const found = await db.query(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [username])
  if (!found.rowCount) return res.status(404).json({ error: 'not_found' })

  await db.query(`DELETE FROM users WHERE id = $1`, [found.rows[0].id])
  res.json({ ok: true, deletedUsername: username })
})

app.delete('/api/admin/users', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })

  const adminSecret = process.env.ADMIN_SECRET || ''
  if (!adminSecret) return res.status(501).json({ error: 'admin_not_configured' })

  const provided = String(req.header('x-admin-secret') || req.query?.secret || '')
  if (provided !== adminSecret) return res.status(401).json({ error: 'unauthorized' })

  const email = String(req.query?.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'missing_email' })

  const found = await db.query(`SELECT id, username, email FROM users WHERE email = $1 LIMIT 1`, [email])
  if (!found.rowCount) return res.status(404).json({ error: 'not_found' })

  await db.query(`DELETE FROM users WHERE id = $1`, [found.rows[0].id])
  res.json({ ok: true, deletedEmail: found.rows[0].email, deletedUsername: found.rows[0].username })
})

app.delete('/api/admin/reset-db', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })

  const adminSecret = process.env.ADMIN_SECRET || ''
  if (!adminSecret) return res.status(501).json({ error: 'admin_not_configured' })

  const provided = String(req.header('x-admin-secret') || req.query?.secret || '')
  if (provided !== adminSecret) return res.status(401).json({ error: 'unauthorized' })

  await db.query('BEGIN')
  try {
    await db.query(`TRUNCATE TABLE comments RESTART IDENTITY CASCADE`)
    await db.query(`TRUNCATE TABLE likes RESTART IDENTITY CASCADE`)
    await db.query(`TRUNCATE TABLE posts RESTART IDENTITY CASCADE`)
    await db.query(`TRUNCATE TABLE follows RESTART IDENTITY CASCADE`)
    await db.query(`TRUNCATE TABLE user_interests RESTART IDENTITY CASCADE`)
    await db.query(`TRUNCATE TABLE oauth_accounts RESTART IDENTITY CASCADE`)
    await db.query(`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    await db.query('COMMIT')
    return res.json({ ok: true, reset: 'all_data_deleted' })
  } catch (e) {
    await db.query('ROLLBACK')
    return res.status(500).json({ error: 'reset_failed' })
  }
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
  const meResult = await db.query(
    `SELECT username, avatar_url, bio, accepts_commissions, commission_categories, commission_price_info FROM users WHERE id = $1 LIMIT 1`,
    [user.id]
  )
  const meRow = meResult.rows[0] || {
    username: user.username,
    avatar_url: null,
    bio: '',
    accepts_commissions: false,
    commission_categories: '[]',
    commission_price_info: ''
  }
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
    user: {
      id: user.id,
      username: String(meRow.username || user.username),
      avatarUrl: meRow.avatar_url || null,
      bio: String(meRow.bio || ''),
      acceptsCommissions: Boolean(meRow.accepts_commissions),
      commissionCategories: safeJsonArrayText(meRow.commission_categories),
      commissionPriceInfo: String(meRow.commission_price_info || '')
    },
    interests: interestsResult.rows.map((r) => r.interest),
    following: followingResult.rows.map((r) => r.username)
  })
})

app.patch('/api/me/profile', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const bio = String(req.body?.bio ?? '').trim().slice(0, 220)
  const avatarUrlRaw = String(req.body?.avatarUrl ?? '').trim()
  const avatarUrl = avatarUrlRaw ? avatarUrlRaw.slice(0, 2000) : null

  const usernameRaw = req.body?.username
  const nextUsername = typeof usernameRaw === 'string' ? usernameRaw.trim() : null
  if (nextUsername && (!/^[A-Za-z0-9_]{3,20}$/.test(nextUsername))) {
    return res.status(400).json({ error: 'invalid_username' })
  }

  await db.query('BEGIN')
  try {
    if (nextUsername) {
      await db.query(`UPDATE users SET username = $2, bio = $3, avatar_url = $4 WHERE id = $1`, [user.id, nextUsername, bio, avatarUrl])
    } else {
      await db.query(`UPDATE users SET bio = $2, avatar_url = $3 WHERE id = $1`, [user.id, bio, avatarUrl])
    }
    await db.query('COMMIT')
  } catch (e) {
    await db.query('ROLLBACK')
    if (String(e?.code || '') === '23505') return res.status(409).json({ error: 'user_exists' })
    return res.status(500).json({ error: 'update_failed' })
  }

  const meResult = await db.query(`SELECT username, avatar_url, bio FROM users WHERE id = $1 LIMIT 1`, [user.id])
  const row = meResult.rows[0]
  const username = String(row?.username || user.username)
  const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: { id: user.id, username, bio: String(row?.bio || ''), avatarUrl: row?.avatar_url || null } })
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
        p.description,
        p.tags,
        COALESCE(p.media_url, p.image_url) as media_url,
        COALESCE(p.media_type, 'image') as media_type,
        p.shares_count,
        p.created_at,
        u.username as author,
        u.avatar_url as author_avatar_url,
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
    authorAvatarUrl: r.author_avatar_url || null,
    title: r.title,
    description: String(r.description || ''),
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
  const description = String(req.body?.description ?? '').trim()
  const tags = normalizeTags(req.body?.tags)
  const mediaUrl = String(req.body?.mediaUrl ?? req.body?.imageUrl ?? '')
  const mediaType = String(req.body?.mediaType ?? (String(req.body?.imageUrl ?? '').startsWith('data:video') ? 'video' : 'image')).toLowerCase()
  if (title.length < 1 || title.length > 80) return res.status(400).json({ error: 'invalid_title' })
  if (description.length > 500) return res.status(400).json({ error: 'invalid_description' })
  if (!mediaUrl) return res.status(400).json({ error: 'missing_media' })
  if (mediaType !== 'image' && mediaType !== 'video') return res.status(400).json({ error: 'invalid_media_type' })
  const id = crypto.randomUUID()
  const inserted = await p.query(
    `INSERT INTO posts (id, user_id, title, description, tags, image_url, media_url, media_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
    [id, user.id, title, description, JSON.stringify(tags), mediaUrl, mediaUrl, mediaType]
  )
  const avatarResult = await p.query(`SELECT avatar_url FROM users WHERE id = $1 LIMIT 1`, [user.id])
  const authorAvatarUrl = avatarResult.rows[0]?.avatar_url ?? null
  const row = inserted.rows[0]
  res.json({
    post: {
      id: row.id,
      author: user.username,
      authorAvatarUrl,
      title,
      description,
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
  const description = String(req.body?.description ?? '').trim()
  const tags = normalizeTags(req.body?.tags)

  if (title.length < 1 || title.length > 80) return res.status(400).json({ error: 'invalid_title' })
  if (description.length > 500) return res.status(400).json({ error: 'invalid_description' })

  const owner = await p.query(`SELECT user_id FROM posts WHERE id = $1 LIMIT 1`, [postId])
  if (!owner.rowCount) return res.status(404).json({ error: 'not_found' })
  if (String(owner.rows[0].user_id) !== user.id) return res.status(403).json({ error: 'forbidden' })

  await p.query(`UPDATE posts SET title = $2, description = $3, tags = $4 WHERE id = $1`, [postId, title, description, JSON.stringify(tags)])

  const postResult = await p.query(
    `
      SELECT
        p.id,
        p.title,
        p.description,
        p.tags,
        COALESCE(p.media_url, p.image_url) as media_url,
        COALESCE(p.media_type, 'image') as media_type,
        p.shares_count,
        p.created_at,
        u.username as author,
        u.avatar_url as author_avatar_url,
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
      authorAvatarUrl: row.author_avatar_url || null,
      title: row.title,
      description: String(row.description || ''),
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

app.delete('/api/posts/:id', async (req, res) => {
  await ensureSchema()
  const p = getPool()
  if (!p) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const postId = String(req.params.id)
  const owner = await p.query(`SELECT user_id FROM posts WHERE id = $1 LIMIT 1`, [postId])
  if (!owner.rowCount) return res.status(404).json({ error: 'not_found' })
  if (String(owner.rows[0].user_id) !== user.id) return res.status(403).json({ error: 'forbidden' })

  await p.query(`DELETE FROM posts WHERE id = $1`, [postId])
  res.json({ ok: true })
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

app.patch('/api/me/commissions', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const acceptsCommissions = Boolean(req.body?.acceptsCommissions)
  const categories = normalizeCommissionCategories(req.body?.categories)
  const priceInfo = String(req.body?.priceInfo ?? '').trim().slice(0, 800)
  await db.query(
    `UPDATE users SET accepts_commissions = $2, commission_categories = $3, commission_price_info = $4 WHERE id = $1`,
    [user.id, acceptsCommissions, JSON.stringify(categories), priceInfo]
  )
  res.json({ ok: true, acceptsCommissions, categories, priceInfo })
})

app.get('/api/commissions/artists', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const category = String(req.query?.category ?? '').trim().toLowerCase()
  const result = await db.query(
    `
      SELECT username, avatar_url, bio, commission_categories, commission_price_info
      FROM users
      WHERE accepts_commissions = true
      ORDER BY created_at DESC
      LIMIT 100
    `
  )
  const artists = result.rows
    .map((r) => {
      const categories = safeJsonArrayText(r.commission_categories).map((c) => String(c))
      return {
        username: String(r.username),
        avatarUrl: r.avatar_url || null,
        bio: String(r.bio || ''),
        categories,
        priceInfo: String(r.commission_price_info || '')
      }
    })
    .filter((a) => (category ? a.categories.includes(category) : true))
  res.json({ artists })
})

async function getOrCreateConversation(db, userIdA, userIdB) {
  const [user1Id, user2Id] = orderUserIds(userIdA, userIdB)
  const existing = await db.query(`SELECT id FROM conversations WHERE user1_id = $1 AND user2_id = $2 LIMIT 1`, [user1Id, user2Id])
  if (existing.rowCount) return String(existing.rows[0].id)
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO conversations (id, user1_id, user2_id, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (user1_id, user2_id) DO NOTHING`,
    [id, user1Id, user2Id]
  )
  const row = await db.query(`SELECT id FROM conversations WHERE user1_id = $1 AND user2_id = $2 LIMIT 1`, [user1Id, user2Id])
  return String(row.rows[0].id)
}

app.post('/api/commissions/requests', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const artistUsername = String(req.body?.artistUsername ?? '').trim()
  const title = String(req.body?.title ?? '').trim().slice(0, 80)
  const details = String(req.body?.details ?? '').trim().slice(0, 2000)
  if (!artistUsername) return res.status(400).json({ error: 'missing_artist' })
  if (!title) return res.status(400).json({ error: 'missing_title' })
  if (!details) return res.status(400).json({ error: 'missing_details' })

  const artist = await db.query(`SELECT id, username FROM users WHERE username = $1 LIMIT 1`, [artistUsername])
  if (!artist.rowCount) return res.status(404).json({ error: 'artist_not_found' })
  const artistId = String(artist.rows[0].id)
  if (artistId === user.id) return res.status(400).json({ error: 'invalid_artist' })

  const conversationId = await getOrCreateConversation(db, user.id, artistId)
  const requestId = crypto.randomUUID()
  await db.query(
    `INSERT INTO commission_requests (id, requester_id, artist_id, title, details, status, conversation_id) VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
    [requestId, user.id, artistId, title, details, conversationId]
  )
  const messageId = crypto.randomUUID()
  await db.query(
    `INSERT INTO messages (id, conversation_id, sender_id, text) VALUES ($1, $2, $3, $4)`,
    [messageId, conversationId, user.id, `Solicitud de comisión: ${title}\n\n${details}`]
  )
  await db.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId])

  res.json({ requestId, conversationId })
})

app.get('/api/conversations', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const result = await db.query(
    `
      SELECT
        c.id,
        c.user1_id,
        c.user2_id,
        c.updated_at,
        u.username as other_username,
        u.avatar_url as other_avatar_url,
        m.text as last_text,
        m.created_at as last_created_at
      FROM conversations c
      JOIN users u ON u.id = CASE WHEN c.user1_id = $1::uuid THEN c.user2_id ELSE c.user1_id END
      LEFT JOIN LATERAL (
        SELECT text, created_at
        FROM messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      WHERE c.user1_id = $1::uuid OR c.user2_id = $1::uuid
      ORDER BY c.updated_at DESC
      LIMIT 100
    `,
    [user.id]
  )

  const conversations = result.rows.map((r) => ({
    id: String(r.id),
    otherUsername: String(r.other_username),
    otherAvatarUrl: r.other_avatar_url || null,
    lastText: r.last_text ? String(r.last_text) : '',
    lastAt: r.last_created_at || r.updated_at
  }))
  res.json({ conversations })
})

app.post('/api/conversations', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const otherUsername = String(req.body?.username ?? '').trim()
  if (!otherUsername) return res.status(400).json({ error: 'missing_username' })
  const other = await db.query(`SELECT id, username, avatar_url FROM users WHERE username = $1 LIMIT 1`, [otherUsername])
  if (!other.rowCount) return res.status(404).json({ error: 'not_found' })
  const otherId = String(other.rows[0].id)
  if (otherId === user.id) return res.status(400).json({ error: 'invalid_user' })

  const conversationId = await getOrCreateConversation(db, user.id, otherId)
  res.json({
    conversation: {
      id: conversationId,
      otherUsername: String(other.rows[0].username),
      otherAvatarUrl: other.rows[0].avatar_url || null,
      lastText: '',
      lastAt: new Date().toISOString()
    }
  })
})

app.get('/api/conversations/:id/messages', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const conversationId = String(req.params.id)
  const conv = await db.query(`SELECT user1_id, user2_id FROM conversations WHERE id = $1 LIMIT 1`, [conversationId])
  if (!conv.rowCount) return res.status(404).json({ error: 'not_found' })
  const row = conv.rows[0]
  const isMember = String(row.user1_id) === user.id || String(row.user2_id) === user.id
  if (!isMember) return res.status(403).json({ error: 'forbidden' })

  const messagesResult = await db.query(
    `
      SELECT m.id, m.text, m.created_at, u.username as sender, u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT 100
    `,
    [conversationId]
  )
  const messages = messagesResult.rows
    .map((m) => ({
      id: String(m.id),
      text: String(m.text),
      createdAt: m.created_at,
      sender: String(m.sender),
      senderAvatarUrl: m.sender_avatar_url || null
    }))
    .reverse()
  res.json({ messages })
})

app.post('/api/conversations/:id/messages', async (req, res) => {
  await ensureSchema()
  const db = getPool()
  if (!db) return res.status(500).json({ error: 'db_not_configured' })
  const user = requireAuth(req, res)
  if (!user) return

  const conversationId = String(req.params.id)
  const text = String(req.body?.text ?? '').trim().slice(0, 2000)
  if (!text) return res.status(400).json({ error: 'missing_text' })

  const conv = await db.query(`SELECT user1_id, user2_id FROM conversations WHERE id = $1 LIMIT 1`, [conversationId])
  if (!conv.rowCount) return res.status(404).json({ error: 'not_found' })
  const row = conv.rows[0]
  const isMember = String(row.user1_id) === user.id || String(row.user2_id) === user.id
  if (!isMember) return res.status(403).json({ error: 'forbidden' })

  const id = crypto.randomUUID()
  const created = await db.query(
    `INSERT INTO messages (id, conversation_id, sender_id, text) VALUES ($1, $2, $3, $4) RETURNING created_at`,
    [id, conversationId, user.id, text]
  )
  await db.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId])
  res.json({ message: { id, sender: user.username, text, createdAt: created.rows[0].created_at } })
})

export default app
