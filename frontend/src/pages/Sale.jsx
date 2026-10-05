import { useEffect, useState } from 'react'
import api from '../api'

const money = (amount) => `₹${Number(amount).toFixed(2)}`

export default function Sale() {
  const [items, setItems] = useState([])
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [receipt, setReceipt] = useState(null)
  const [qrOrder, setQrOrder] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [printWhenReady, setPrintWhenReady] = useState(false)

  async function loadItems() {
    const { data } = await api.get('/store/products')
    setItems(data)
  }

  useEffect(() => {
    loadItems().catch(() => setError('Could not load items. Check the server connection.'))
  }, [])

  useEffect(() => {
    if (!receipt || !printWhenReady) return undefined
    const timer = setTimeout(() => {
      window.print()
      setPrintWhenReady(false)
    }, 150)
    return () => clearTimeout(timer)
  }, [receipt, printWhenReady])

  useEffect(() => {
    if (!qrOrder || paymentStatus !== 'pending') return undefined
    let cancelled = false
    let timer
    const checkPayment = async () => {
      try {
        const { data } = await api.get(`/store/orders/${qrOrder.id}/payment`)
        if (cancelled) return
        if (data.status === 'paid') {
          setReceipt({ ...qrOrder, payment_status: 'paid' })
          setPrintWhenReady(true)
          setQrOrder(null)
          return
        }
        if (data.status === 'expired' || data.status === 'failed') {
          setPaymentStatus(data.status)
          return
        }
      } catch {
        if (!cancelled) setError('Could not check payment status. Keep this screen open and retry shortly.')
      }
      if (!cancelled) timer = setTimeout(checkPayment, 1000)
    }
    void checkPayment()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [qrOrder, paymentStatus])

  function addToCart(item) {
    setReceipt(null)
    setCart((current) => {
      const existing = current.find((entry) => entry.id === item.id)
      if (existing) return current.map((entry) => entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry)
      return [...current, { ...item, quantity: 1 }]
    })
  }

  function changeQuantity(id, difference) {
    setCart((current) => current
      .map((entry) => entry.id === id ? { ...entry, quantity: entry.quantity + difference } : entry)
      .filter((entry) => entry.quantity > 0))
  }

  const total = cart.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0) / 100

  async function completeSale(method = paymentMethod) {
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/store/orders', {
        paymentMethod: method,
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
      })
      setCart([])
      if (method === 'upi') {
        setPaymentStatus('pending')
        setQrOrder(data)
      } else {
        setReceipt(data)
        setPrintWhenReady(true)
      }
    } catch (requestError) {
      const serverMessage = requestError.response?.data?.message
      const failureDetail = requestError.response
        ? `Sale save failed (HTTP ${requestError.response.status}): ${requestError.message}`
        : requestError.message || 'No response from the sales server.'
      setError(serverMessage || `Could not save the sale: ${failureDetail}`)
    } finally {
      setBusy(false)
    }
  }

  function startNewSale() {
    setReceipt(null)
    setQrOrder(null)
    setPaymentStatus('pending')
    setPaymentMethod('cash')
    setError('')
  }

  function selectPaymentMethod(method) {
    setPaymentMethod(method)
    if (method === 'upi' && cart.length && !busy) void completeSale('upi')
  }

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6 border-b border-slate-200 pb-4 print:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta-700">Checkout</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">New sale</h1>
      </header>

      {error && <p role="alert" className="mb-4 text-sm text-rose-700 print:hidden">{error}</p>}

      {receipt ? (
        <article className="receipt mx-auto max-w-lg bg-white p-6 text-slate-900 print:max-w-none print:p-0">
          <div className="text-center">
            <h2 className="text-2xl font-bold">BOBBATLU</h2>
            <p className="mt-1 text-sm">Payment receipt</p>
          </div>
          <div className="my-5 border-y border-dashed border-slate-400 py-3 text-sm">
            <p>Bill: {receipt.bill_no}</p>
            <p>Date: {new Date(receipt.created_at).toLocaleString()}</p>
            <p>Payment: {receipt.payment_method.toUpperCase()}</p>
          </div>
          <div className="space-y-2">
            {receipt.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 text-sm">
                <span>{item.name} × {item.quantity}</span><span>{money(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between border-t border-slate-400 pt-3 text-lg font-bold"><span>Total paid</span><span>{money(receipt.total)}</span></div>
          <p className="mt-6 text-center text-sm">Thank you</p>
          <div className="mt-6 flex justify-center gap-3 print:hidden">
            <button onClick={() => window.print()} className="rounded-md bg-terracotta-700 px-5 py-2.5 font-semibold text-white">Print receipt</button>
            <button onClick={startNewSale} className="rounded-md border border-slate-300 px-5 py-2.5 font-semibold text-slate-700">New sale</button>
          </div>
        </article>
      ) : qrOrder ? (
        <article className="mx-auto max-w-lg border border-slate-200 bg-white p-6 text-center">
          <h2 className="text-xl font-bold text-slate-900">Scan to pay</h2>
          <p className="mt-2 text-sm text-slate-600">Bill {qrOrder.bill_no}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{money(qrOrder.total)}</p>
          <img src={qrOrder.qr.imageUrl} alt="Razorpay UPI payment QR code" className="mx-auto my-1 aspect-square w-full max-w-[28rem] object-cover " />
          {paymentStatus === 'pending' ? <>
            <p role="status" className="text-sm font-medium text-terracotta-800">Waiting for UPI payment confirmation…</p>
            <p className="mt-2 text-xs text-slate-500">This single-use QR is for this bill and expires in 15 minutes.</p>
          </> : <>
            <p role="status" className="text-sm font-semibold text-rose-700">{paymentStatus === 'expired' ? 'This QR code has expired. No payment was confirmed.' : 'The payment could not be completed.'}</p>
            <button onClick={startNewSale} className="mt-5 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Return to checkout</button>
          </>}
        </article>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="print:hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Select items</h2>
              <button onClick={() => loadItems().catch(() => setError('Could not refresh items.'))} className="text-sm font-medium text-terracotta-800">Refresh</button>
            </div>
            {items.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => (
                  <button key={item.id} onClick={() => addToCart(item)} className="flex min-h-28 flex-col items-start justify-between border border-slate-200 bg-white p-4 text-left hover:border-terracotta-700 hover:bg-terracotta-50">
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    <span className="mt-3 tabular-nums text-sm text-slate-600">{money(item.price)}</span>
                  </button>
                ))}
              </div>
            ) : <p className="border border-dashed border-slate-300 p-8 text-center text-slate-500">Add items in Menu to start a sale.</p>}
          </section>

          <aside className="h-fit border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 print:hidden">
            <h2 className="text-lg font-semibold text-slate-900">Current bill</h2>
            {cart.length ? <ul className="mt-4 divide-y divide-slate-200">
              {cart.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="truncate font-medium text-slate-800">{item.name}</p><p className="text-sm text-slate-500">{money(item.price)} each</p></div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button aria-label={`Decrease ${item.name} quantity`} onClick={() => changeQuantity(item.id, -1)} className="h-8 w-8 border border-slate-300 font-semibold">−</button>
                    <span className="w-6 text-center tabular-nums">{item.quantity}</span>
                    <button aria-label={`Increase ${item.name} quantity`} onClick={() => changeQuantity(item.id, 1)} className="h-8 w-8 border border-slate-300 font-semibold">+</button>
                  </div>
                </li>
              ))}
            </ul> : <p className="py-8 text-sm text-slate-500">Choose an item to add it to the bill.</p>}

            <div className="flex justify-between border-t border-slate-300 py-4 text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-slate-700">Payment method</legend>
              <div className="grid grid-cols-2 gap-2">
                {['cash', 'upi'].map((method) => (
                  <button key={method} type="button" aria-pressed={paymentMethod === method} disabled={busy} onClick={() => selectPaymentMethod(method)} className={`rounded-md border px-3 py-2.5 font-semibold disabled:opacity-60 ${paymentMethod === method ? 'border-terracotta-700 bg-terracotta-50 text-terracotta-900' : 'border-slate-300 text-slate-600'}`}>{method.toUpperCase()}</button>
                ))}
              </div>
            </fieldset>
            <button disabled={!cart.length || busy} onClick={() => completeSale()} className="mt-4 w-full rounded-md bg-terracotta-700 px-4 py-3 font-semibold text-white hover:bg-terracotta-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? paymentMethod === 'upi' ? 'Generating QR…' : 'Saving sale…' : paymentMethod === 'upi' ? 'Generate UPI QR' : 'Save & Print'}</button>
          </aside>
        </div>
      )}
    </section>
  )
}
