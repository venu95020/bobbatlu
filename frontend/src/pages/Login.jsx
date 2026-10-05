import { useState } from 'react'
import { useAuth } from '../auth'

export default function Login() {
  const { requestOtp, verifyOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpRequested, setOtpRequested] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const requestCode = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await requestOtp(email)
      setOtpRequested(true)
    } catch (err) {
      setError(err.response?.status === 429 ? 'Too many attempts. Try again in a minute.' : err.response?.data?.message || 'Unable to reach server.')
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await verifyOtp(email, otp)
    } catch (err) {
      setError(err.response?.status === 429 ? 'Too many attempts. Try again in a minute.' : err.response?.data?.message || 'Unable to reach server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={otpRequested ? verifyCode : requestCode} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow">
        <h1 className="text-center text-2xl font-bold text-terracotta-700">BOBBATLU</h1>
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <label className="block text-sm font-medium">Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={otpRequested} className="mt-1 w-full rounded-lg border p-3 read-only:bg-slate-100" />
        </label>
        {otpRequested && <>
          <label className="block text-sm font-medium">Email code
            <input type="text" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 w-full rounded-lg border p-3" />
          </label>
          <button type="button" onClick={() => { setOtpRequested(false); setOtp(''); setError('') }} className="w-full text-sm text-terracotta-700">Use a different email</button>
        </>}
        <button disabled={busy} className="w-full rounded-lg bg-terracotta-700 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Please wait…' : otpRequested ? 'VERIFY CODE' : 'EMAIL ME A CODE'}</button>
      </form>
    </div>
  )
}
