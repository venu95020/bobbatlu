import { createContext, useContext, useEffect, useState } from 'react'
import api from './api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('token'))

  useEffect(() => {
    if (!localStorage.getItem('token')) return
    api.get('/auth/me').then((r) => setUser(r.data)).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false))
  }, [])

  const requestOtp = async (email) => {
    await api.post('/auth/request-otp', { email })
  }
  const verifyOtp = async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp })
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }
  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    localStorage.removeItem('token')
    setUser(null)
  }
  return <Ctx.Provider value={{ user, loading, requestOtp, verifyOtp, logout }}>{children}</Ctx.Provider>
}
