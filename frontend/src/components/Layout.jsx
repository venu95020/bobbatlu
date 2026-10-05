import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'

export const NAV = [
  { to: '/sale', icon: '🛒', label: 'Sale', sub: 'Create Bill' },
  { to: '/reports', icon: '📊', label: 'Reports', sub: 'View Reports' },
  { to: '/menu', icon: '🍽️', label: 'Menu', sub: 'Manage Items' },
  { to: '/settings', icon: '⚙️', label: 'Settings', sub: 'Configuration' },
]

const link = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${isActive ? 'bg-terracotta-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`

export default function Layout() {
  const { logout } = useAuth()
  const order = ['/sale', '/menu', '/reports', '/settings']
  const items = order.map((p) => NAV.find((n) => n.to === p))
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 flex-col border-r bg-white p-4 md:flex">
        <NavLink to="/dashboard" className="mb-6 px-2 text-xl font-bold text-terracotta-700">BOBBATLU</NavLink>
        <nav className="flex flex-col gap-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} className={link}><span>{n.icon}</span>{n.label}</NavLink>
          ))}
        </nav>
        <button onClick={logout} className="mt-auto rounded-lg border px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100">Logout</button>
      </aside>
      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-white md:hidden">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex flex-1 flex-col items-center py-2 text-xs ${isActive ? 'font-semibold text-terracotta-700' : 'text-slate-500'}`}>
            <span className="text-xl">{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
