import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { NAV } from '../components/Layout'

export default function Dashboard() {
  const { user, logout } = useAuth()
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-center text-2xl font-bold text-terracotta-700">BOBBATLU</h1>
      <p className="mb-6 mt-1 text-center text-slate-600">Welcome, {user?.name}</p>
      <div className="grid grid-cols-2 gap-4 md:gap-6">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col items-center rounded-2xl bg-white p-6 text-center shadow transition hover:shadow-md md:p-10">
            <span className="text-4xl md:text-5xl">{n.icon}</span>
            <span className="mt-3 text-lg font-bold">{n.label.toUpperCase()}</span>
            <span className="text-sm text-slate-500">{n.sub}</span>
          </Link>
        ))}
      </div>
      <button onClick={logout} className="mx-auto mt-8 block text-sm font-semibold text-slate-600 underline md:hidden">LOGOUT</button>
    </div>
  )
}
