import { useEffect, useState } from 'react'
import api from '../api'

const money = (amount) => `₹${Number(amount).toFixed(2)}`

function localDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function initialDateRange(offset = 0) {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  const value = localDate(date)
  return { from: value, to: value }
}

export default function Reports() {
  const [dates, setDates] = useState(() => initialDateRange())
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadReport(from = dates.from, to = dates.to) {
    setError('')
    setBusy(true)
    try {
      const { data } = await api.get('/store/reports', { params: { from, to } })
      setReport(data)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load the sales report.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadReport(dates.from, dates.to)
  }, [])

  function choosePreset(offset) {
    const range = initialDateRange(offset)
    setDates(range)
    loadReport(range.from, range.to)
  }

  function submitDates(event) {
    event.preventDefault()
    const daySpan = (Date.parse(`${dates.to}T00:00:00`) - Date.parse(`${dates.from}T00:00:00`)) / 86_400_000
    if (!dates.from || !dates.to || daySpan < 0 || daySpan > 30) {
      setError('Choose a valid date range of no more than 31 days.')
      return
    }
    loadReport()
  }

  const dailyRows = new Map()
  for (const row of report?.daily || []) {
    const day = dailyRows.get(row.sale_date) || { cash: { count: 0, total: 0 }, upi: { count: 0, total: 0 } }
    if (day[row.payment_method]) day[row.payment_method] = { count: row.saleCount, total: row.total }
    dailyRows.set(row.sale_date, day)
  }

  return (
    <section className="mx-auto max-w-5xl">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta-700">Sales overview</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Reports</h1>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => choosePreset(0)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-terracotta-700">Today</button>
        <button onClick={() => choosePreset(1)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-terracotta-700">Yesterday</button>
      </div>

      <form onSubmit={submitDates} className="mb-8 grid gap-3 border-b border-slate-200 pb-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-medium text-slate-700">From
          <input type="date" required value={dates.from} max={dates.to || undefined} onChange={(event) => setDates((current) => ({ ...current, from: event.target.value }))} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input type="date" required value={dates.to} min={dates.from || undefined} max={localDate(new Date())} onChange={(event) => setDates((current) => ({ ...current, to: event.target.value }))} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5" />
        </label>
        <button disabled={busy} className="rounded-md bg-terracotta-700 px-5 py-2.5 font-semibold text-white disabled:opacity-60">{busy ? 'Loading…' : 'Apply dates'}</button>
      </form>

      {error && <p role="alert" className="mb-5 text-sm text-rose-700">{error}</p>}
      {report && <>
        <p className="mb-4 text-sm text-slate-500">{report.from} to {report.to}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="border-l-4 border-slate-800 bg-white p-4">
            <p className="text-sm font-medium text-slate-500">Total sales · {report.saleCount} bills</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{money(report.totalSales)}</p>
          </article>
          <article className="border-l-4 border-emerald-600 bg-white p-4">
            <p className="text-sm font-medium text-slate-500">Cash · {report.summary.cash.saleCount} bills</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{money(report.summary.cash.total)}</p>
          </article>
          <article className="border-l-4 border-terracotta-600 bg-white p-4">
            <p className="text-sm font-medium text-slate-500">UPI · {report.summary.upi.saleCount} bills</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{money(report.summary.upi.total)}</p>
          </article>
        </div>

        <div className="mt-8 overflow-x-auto">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Daily breakdown</h2>
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-y border-slate-300 text-slate-500"><th className="py-3 pr-4 font-medium">Date</th><th className="py-3 pr-4 font-medium">Cash</th><th className="py-3 pr-4 font-medium">UPI</th><th className="py-3 font-medium">Total</th></tr></thead>
            <tbody>
              {[...dailyRows.entries()].sort(([first], [second]) => second.localeCompare(first)).map(([day, values]) => (
                <tr key={day} className="border-b border-slate-200">
                  <td className="py-3 pr-4 font-medium text-slate-800">{day}</td>
                  <td className="py-3 pr-4 tabular-nums">{money(values.cash.total)} <span className="text-slate-500">({values.cash.count})</span></td>
                  <td className="py-3 pr-4 tabular-nums">{money(values.upi.total)} <span className="text-slate-500">({values.upi.count})</span></td>
                  <td className="py-3 font-semibold tabular-nums">{money(values.cash.total + values.upi.total)}</td>
                </tr>
              ))}
              {!dailyRows.size && <tr><td colSpan="4" className="py-8 text-center text-slate-500">No paid sales in this date range.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-10 overflow-x-auto">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900">Bills</h2>
            <span className="text-sm text-slate-500">{report.bills.length} paid bills</span>
          </div>
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead><tr className="border-y border-slate-300 text-slate-500"><th className="py-3 pr-4 font-medium">Bill</th><th className="py-3 pr-4 font-medium">Time</th><th className="py-3 pr-4 font-medium">Items</th><th className="py-3 pr-4 font-medium">Payment</th><th className="py-3 text-right font-medium">Total</th></tr></thead>
            <tbody>
              {report.bills.map((bill) => (
                <tr key={bill.id} className="border-b border-slate-200 align-top">
                  <td className="py-3 pr-4 font-medium text-slate-800">{bill.bill_no}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-slate-600">{new Date(bill.created_at).toLocaleString()}</td>
                  <td className="py-3 pr-4">{bill.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</td>
                  <td className="py-3 pr-4 font-medium text-slate-700">{bill.payment_method.toUpperCase()}</td>
                  <td className="whitespace-nowrap py-3 text-right font-semibold tabular-nums">{money(bill.total)}</td>
                </tr>
              ))}
              {!report.bills.length && <tr><td colSpan="5" className="py-8 text-center text-slate-500">No paid bills in this date range.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  )
}