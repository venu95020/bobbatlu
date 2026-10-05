import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

export async function initializeDatabase() {
  const schemaPath = fileURLToPath(new URL('../database/schema.sql', import.meta.url))
  const schema = await readFile(schemaPath, 'utf8')
  await pool.query(schema)
  await pool.query(
    `INSERT INTO users (name, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name`,
    [process.env.ADMIN_NAME || 'Store Admin', process.env.ADMIN_EMAIL.toLowerCase()],
  )
}