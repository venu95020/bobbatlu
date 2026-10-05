import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import nodemailer from 'nodemailer'
import { pool } from './db.js'

const router = Router()
const adminEmail = (process.env.ADMIN_EMAIL || 'samruddhivskp@gmail.com').trim().toLowerCase()
const otpTtlMinutes = Math.max(1, Number(process.env.LOGIN_OTP_TTL || 10))
const otpMaxAttempts = 5
let mailer

const requestOtpLimit = rateLimit({
  windowMs: 60_000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many code requests. Try again in a minute.' },
})

const verifyOtpLimit = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in a minute.' },
})

function hashOtp(email, otp) {
  return createHmac('sha256', process.env.OTP_SECRET).update(`${email}:${otp}`).digest('hex')
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function createMailer() {
  if (mailer) return mailer
  const host = process.env.MAIL_HOST || process.env.SMTP_HOST
  const fromAddress = process.env.MAIL_FROM_ADDRESS || process.env.SMTP_FROM
  const username = process.env.MAIL_USERNAME || process.env.SMTP_USER
  const password = process.env.MAIL_PASSWORD || process.env.SMTP_PASS
  if (!host || !fromAddress) {
    throw new Error('SMTP settings are not configured.')
  }
  const port = Number(process.env.MAIL_PORT || 587)
  mailer = nodemailer.createTransport({
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    host,
    port,
    secure: (process.env.MAIL_SECURE || process.env.SMTP_SECURE) === 'true' || port === 465,
    auth: username
      ? { user: username.trim(), pass: password }
      : undefined,
  })
  return mailer
}

async function sendLoginCode(email, otp) {
  await createMailer().sendMail({
    from: `"${process.env.MAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'Bobbatlu'}" <${process.env.MAIL_FROM_ADDRESS || process.env.SMTP_FROM}>`,
    to: email,
    subject: 'Your Bobbatlu login code',
    text: `Your Bobbatlu login code is ${otp}. It expires in ${otpTtlMinutes} minutes.`,
  })
}

router.post('/request-otp', requestOtpLimit, async (request, response, next) => {
  try {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response.status(422).json({ message: 'Enter a valid email address.' })
    }

    if (email !== adminEmail) {
      return response.json({ message: 'A login code has been sent if this email is authorized.' })
    }

    const otp = String(randomInt(100000, 1000000))
    const otpHash = hashOtp(email, otp)
    await pool.query(
      `INSERT INTO login_otps (email, otp_hash, expires_at, attempts)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'), 0)
       ON CONFLICT (email) DO UPDATE
       SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at,
           attempts = 0, created_at = NOW()`,
      [email, otpHash, otpTtlMinutes],
    )

    void sendLoginCode(email, otp).catch(async (error) => {
      await pool.query('DELETE FROM login_otps WHERE email = $1 AND otp_hash = $2', [email, otpHash]).catch(() => {})
      console.error('OTP email delivery failed:', error.message)
    })

    return response.json({ message: 'A login code has been sent if this email is authorized.' })
  } catch (error) {
    return next(error)
  }
})

router.post('/verify-otp', verifyOtpLimit, async (request, response, next) => {
  try {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const otp = typeof request.body.otp === 'string' ? request.body.otp.trim() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
      return response.status(422).json({ message: 'Enter a valid email and six-digit code.' })
    }

    const result = await pool.query(
      'SELECT otp_hash, attempts FROM login_otps WHERE email = $1 AND expires_at > NOW()',
      [email],
    )
    const savedOtp = result.rows[0]
    if (email !== adminEmail || !savedOtp || savedOtp.attempts >= otpMaxAttempts) {
      return response.status(422).json({ message: 'The login code is invalid or has expired.' })
    }

    const validOtp = safeEqual(savedOtp.otp_hash, hashOtp(email, otp))
    if (!validOtp) {
      await pool.query('UPDATE login_otps SET attempts = attempts + 1 WHERE email = $1', [email])
      return response.status(422).json({ message: 'The login code is invalid or has expired.' })
    }

    await pool.query('DELETE FROM login_otps WHERE email = $1', [email])
    const userResult = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email])
    const user = userResult.rows[0]
    if (!user) return response.status(422).json({ message: 'The login code is invalid or has expired.' })

    const token = randomBytes(32).toString('base64url')
    await pool.query(
      "INSERT INTO auth_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
      [hashToken(token), user.id],
    )
    return response.json({ token, user })
  } catch (error) {
    return next(error)
  }
})

export async function requireAuth(request, response, next) {
  try {
    const token = request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return response.status(401).json({ message: 'Unauthenticated.' })

    const result = await pool.query(
      `SELECT users.id, users.name, users.email, auth_tokens.token_hash
       FROM auth_tokens JOIN users ON users.id = auth_tokens.user_id
       WHERE auth_tokens.token_hash = $1 AND auth_tokens.expires_at > NOW()`,
      [hashToken(token)],
    )
    if (!result.rowCount) return response.status(401).json({ message: 'Unauthenticated.' })
    request.user = { id: result.rows[0].id, name: result.rows[0].name, email: result.rows[0].email }
    request.tokenHash = result.rows[0].token_hash
    return next()
  } catch (error) {
    return next(error)
  }
}

export default router