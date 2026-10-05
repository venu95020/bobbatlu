import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import cors from 'cors'
import express from 'express'
import authRouter, { requireAuth } from './src/auth.js'
import { initializeDatabase, pool } from './src/db.js'
import storeRouter from './src/store.js'

process.env.ADMIN_EMAIL ||= 'samruddhivskp@gmail.com'
process.env.OTP_SECRET ||= randomBytes(32).toString('hex')

const app = express()
const port = Number(process.env.PORT || 3000)
let databaseReady = false
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())

app.disable('x-powered-by')
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS.'))
  },
}))
app.use(express.json({ limit: '16kb' }))

app.get('/api/health', (_request, response) => response.status(databaseReady ? 200 : 503).json({
  status: databaseReady ? 'ok' : 'waiting-for-database',
  database: databaseReady ? 'ready' : 'unavailable',
}))
app.use('/api/auth', authRouter)
app.use('/api/store', requireAuth, storeRouter)

app.get('/api/auth/me', requireAuth, (request, response) => response.json(request.user))
app.post('/api/auth/logout', requireAuth, async (request, response, next) => {
  try {
    await pool.query('DELETE FROM auth_tokens WHERE token_hash = $1', [request.tokenHash])
    return response.json({ message: 'Logged out.' })
  } catch (error) {
    return next(error)
  }
})

app.use((error, _request, response, _next) => {
  console.error('API request failed:', error.message)
  if (response.headersSent) return
  const status = error.message === 'Origin is not allowed by CORS.' ? 403 : error.status || 500
  const message = status === 403 || error.status ? error.message : 'Internal server error.'
  return response.status(status).json({ message })
})

async function initializeDatabaseWhenAvailable() {
  try {
    await initializeDatabase()
    databaseReady = true
    console.log('PostgreSQL is ready; admin account and schema initialized.')
  } catch (error) {
    databaseReady = false
    console.error(`PostgreSQL is not ready: ${error.message}. Retrying in 15 seconds.`)
    setTimeout(initializeDatabaseWhenAvailable, 15_000).unref()
  }
}

const server = app.listen(port, () => {
  console.log(`Bobbatlu API listening at http://localhost:${port}`)
  void initializeDatabaseWhenAvailable()
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await pool.end()
    process.exit(0)
  }))
}