import app from '../server/app.js'

export const config = {
  runtime: 'nodejs'
}

export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const rawPath = url.searchParams.get('__path') || ''
  url.searchParams.delete('__path')

  const normalizedPath = String(rawPath).replace(/^\/+/, '')
  const nextPath = normalizedPath ? `/api/${normalizedPath}` : '/api'
  const query = url.searchParams.toString()
  req.url = query ? `${nextPath}?${query}` : nextPath

  return app(req, res)
}
