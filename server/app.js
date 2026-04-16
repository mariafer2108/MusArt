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
  res.json({ ok: true, dbConfigured: Boolean(DATABASE_URL), blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) })
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
