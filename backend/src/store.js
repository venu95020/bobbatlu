import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { pool } from './db.js'

const router = Router()

function razorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    const error = new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the backend .env.')
    error.status = 503
    throw error
  }
  return { keyId, keySecret }
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = razorpayCredentials()
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const providerMessage = data.error?.description
    const error = new Error(typeof providerMessage === 'string'
      ? `Razorpay rejected QR creation: ${providerMessage}`
      : 'Razorpay could not process the QR payment request. Check the Razorpay configuration.')
    error.status = response.status === 401 ? 503 : 502
    throw error
  }
  return data
}

router.get('/products', async (_request, response, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, price FROM products WHERE is_active = TRUE ORDER BY name',
    )
    return response.json(result.rows)
  } catch (error) {
    return next(error)
  }
})

router.post('/products', async (request, response, next) => {
  try {
    const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''
    const price = Number(request.body.price)
    if (!name || name.length > 255 || !Number.isFinite(price) || price <= 0) {
      return response.status(422).json({ message: 'Enter an item name and a price greater than zero.' })
    }

    const result = await pool.query(
      'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id, name, price',
      [name, price.toFixed(2)],
    )
    return response.status(201).json(result.rows[0])
  } catch (error) {
    return next(error)
  }
})

router.post('/orders', async (request, response, next) => {
  const items = request.body.items
  const paymentMethod = request.body.paymentMethod
  if (!Array.isArray(items) || !items.length || !['cash', 'upi'].includes(paymentMethod)) {
    return response.status(422).json({ message: 'Add items and select Cash or UPI.' })
  }

  const quantities = new Map()
  for (const item of items) {
    const productId = String(item.productId ?? '')
    const quantity = Number(item.quantity)
    if (!/^\d+$/.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return response.status(422).json({ message: 'One or more item quantities are invalid.' })
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity)
  }

  const client = await pool.connect()
  try {
    const productResult = await client.query(
      'SELECT id, name, price FROM products WHERE is_active = TRUE AND id = ANY($1::bigint[])',
      [[...quantities.keys()]],
    )
    if (productResult.rowCount !== quantities.size) {
      return response.status(422).json({ message: 'An item is no longer available. Refresh the item list.' })
    }

    const lines = productResult.rows.map((product) => {
      const quantity = quantities.get(String(product.id))
      const unitCents = Math.round(Number(product.price) * 100)
      return { product, quantity, lineCents: unitCents * quantity }
    })
    const totalCents = lines.reduce((sum, line) => sum + line.lineCents, 0)
    const billNo = `POS-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`

    await client.query('BEGIN')
    const paymentStatus = paymentMethod === 'cash' ? 'paid' : 'pending'
    const orderResult = await client.query(
      `INSERT INTO orders (bill_no, user_id, subtotal, tax, total, payment_method, payment_status)
       VALUES ($1, $2, $3, 0, $3, $4, $5)
       RETURNING id, bill_no, subtotal, total, payment_method, payment_status, created_at`,
      [billNo, request.user.id, (totalCents / 100).toFixed(2), paymentMethod, paymentStatus],
    )
    const order = orderResult.rows[0]
    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, price, qty, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, line.product.id, line.product.name, line.product.price, line.quantity, (line.lineCents / 100).toFixed(2)],
      )
    }
    await client.query('COMMIT')

    if (paymentMethod === 'upi') {
      try {
        const qr = await razorpayRequest('/payments/qr_codes', {
          method: 'POST',
          body: JSON.stringify({
            type: 'upi_qr',
            name: 'Bobbatlu',
            usage: 'single_use',
            fixed_amount: true,
            payment_amount: totalCents,
            description: `Payment for ${billNo}`,
            close_by: Math.floor(Date.now() / 1000) + 900,
          }),
        })
        if (!qr.id || !qr.image_url) throw new Error('Razorpay did not return a QR image.')
        await pool.query(
          'UPDATE orders SET razorpay_qr_code_id = $1 WHERE id = $2',
          [qr.id, order.id],
        )
        return response.status(201).json({
          ...order,
          qr: { id: qr.id, imageUrl: qr.image_url, expiresAt: qr.close_by },
          items: lines.map(({ product, quantity, lineCents }) => ({
            name: product.name,
            price: product.price,
            quantity,
            lineTotal: (lineCents / 100).toFixed(2),
          })),
        })
      } catch (error) {
        await pool.query("UPDATE orders SET payment_status = 'failed' WHERE id = $1", [order.id])
        return next(error)
      }
    }

    return response.status(201).json({
      ...order,
      items: lines.map(({ product, quantity, lineCents }) => ({
        name: product.name,
        price: product.price,
        quantity,
        lineTotal: (lineCents / 100).toFixed(2),
      })),
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
})

router.get('/orders/:id/payment', async (request, response, next) => {
  try {
    if (!/^\d+$/.test(request.params.id)) {
      return response.status(404).json({ message: 'Sale not found.' })
    }
    const result = await pool.query(
      `SELECT id, total, payment_status, razorpay_qr_code_id
       FROM orders WHERE id = $1 AND user_id = $2 AND payment_method = 'upi'`,
      [request.params.id, request.user.id],
    )
    const order = result.rows[0]
    if (!order) return response.status(404).json({ message: 'Sale not found.' })
    if (order.payment_status === 'paid') return response.json({ status: 'paid' })
    if (order.payment_status !== 'pending' || !order.razorpay_qr_code_id) {
      return response.json({ status: order.payment_status })
    }

    const qr = await razorpayRequest(`/payments/qr_codes/${encodeURIComponent(order.razorpay_qr_code_id)}`)
    const expectedAmount = Math.round(Number(order.total) * 100)
    if (Number(qr.payments_amount_received) >= expectedAmount && Number(qr.payments_count_received) > 0) {
      await pool.query(
        `UPDATE orders SET payment_status = 'paid', updated_at = NOW()
         WHERE id = $1 AND payment_status = 'pending'`,
        [order.id],
      )
      return response.json({ status: 'paid' })
    }
    if (qr.status === 'closed' || (qr.close_by && Number(qr.close_by) < Math.floor(Date.now() / 1000))) {
      await pool.query(
        `UPDATE orders SET payment_status = 'expired', updated_at = NOW()
         WHERE id = $1 AND payment_status = 'pending'`,
        [order.id],
      )
      return response.json({ status: 'expired' })
    }
    return response.json({ status: 'pending' })
  } catch (error) {
    return next(error)
  }
})

router.get('/reports', async (request, response, next) => {
  try {
    const { from, to } = request.query
    const validDate = (value) => typeof value === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
    if (!validDate(from) || !validDate(to)) {
      return response.status(422).json({ message: 'Choose a valid start date and end date.' })
    }
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
    if (days < 0 || days > 30) {
      return response.status(422).json({ message: 'Reports can cover a maximum of 31 days.' })
    }

    const result = await pool.query(
      `SELECT payment_method,
              COUNT(*)::int AS sale_count,
              COALESCE(SUM(total), 0)::numeric(12, 2) AS total
       FROM orders
       WHERE payment_status = 'paid'
         AND created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND created_at < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY payment_method`,
      [from, to],
    )
    const dailyResult = await pool.query(
      `SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS sale_date,
              payment_method,
              COUNT(*)::int AS sale_count,
              COALESCE(SUM(total), 0)::numeric(12, 2) AS total
       FROM orders
       WHERE payment_status = 'paid'
         AND created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND created_at < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY sale_date, payment_method
       ORDER BY sale_date, payment_method`,
      [from, to],
    )
    const billsResult = await pool.query(
      `SELECT orders.id, orders.bill_no, orders.created_at, orders.payment_method, orders.total,
              COALESCE(
                json_agg(json_build_object(
                  'name', order_items.name,
                  'quantity', order_items.qty,
                  'lineTotal', order_items.line_total
                ) ORDER BY order_items.id) FILTER (WHERE order_items.id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM orders
       LEFT JOIN order_items ON order_items.order_id = orders.id
       WHERE orders.payment_status = 'paid'
         AND orders.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND orders.created_at < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY orders.id
       ORDER BY orders.created_at DESC, orders.id DESC`,
      [from, to],
    )
    const summary = { cash: { saleCount: 0, total: 0 }, upi: { saleCount: 0, total: 0 } }
    for (const row of result.rows) {
      if (summary[row.payment_method]) {
        summary[row.payment_method] = { saleCount: row.sale_count, total: Number(row.total) }
      }
    }
    return response.json({
      from,
      to,
      summary,
      totalSales: summary.cash.total + summary.upi.total,
      saleCount: summary.cash.saleCount + summary.upi.saleCount,
      daily: dailyResult.rows.map((row) => ({ ...row, saleCount: row.sale_count, total: Number(row.total) })),
      bills: billsResult.rows.map((row) => ({ ...row, total: Number(row.total) })),
    })
  } catch (error) {
    return next(error)
  }
})

export default router