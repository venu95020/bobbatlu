import { useEffect, useState } from 'react'
import api from '../api'

export default function Items() {
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadItems() {
    const { data } = await api.get('/store/products')
    setItems(data)
  }

  useEffect(() => {
    loadItems().catch(() => setError('Could not load items. Check the server connection.'))
  }, [])

  async function addItem(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/store/products', { name, price: Number(price) })
      setItems((current) => [...current, data].sort((first, second) => first.name.localeCompare(second.name)))
      setName('')
      setPrice('')
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save this item.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta-700">Catalog</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Items</h1>
      </header>

      <form onSubmit={addItem} className="mb-8 grid gap-4 border-b border-slate-200 pb-6 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <label className="block text-sm font-medium text-slate-700">Item name
          <input required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5" placeholder="e.g. Filter coffee" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Price
          <input required min="0.01" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5" placeholder="0.00" />
        </label>
        <button disabled={busy} className="rounded-md bg-terracotta-700 px-5 py-2.5 font-semibold text-white hover:bg-terracotta-800 disabled:opacity-60">{busy ? 'Adding…' : 'Add item'}</button>
      </form>

      {error && <p role="alert" className="mb-4 text-sm text-rose-700">{error}</p>}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h2 className="text-lg font-semibold text-slate-900">Available items</h2>
        <span className="text-sm text-slate-500">{items.length} items</span>
      </div>
      {items.length ? (
        <ul className="divide-y divide-slate-200">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-4">
              <span className="font-medium text-slate-800">{item.name}</span>
              <span className="tabular-nums font-semibold text-slate-900">₹{Number(item.price).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="py-10 text-center text-sm text-slate-500">No items yet. Add the first item above.</p>}
    </section>
  )
}