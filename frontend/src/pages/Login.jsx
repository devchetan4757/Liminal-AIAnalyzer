import { useState } from 'react'
import axios from 'axios'
import { ShieldCheck } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

const api = axios.create({ baseURL: '/api' })

// FastAPI returns two different shapes under `detail`:
//   - a plain string, for HTTPException(detail="...") (e.g. wrong password)
//   - an array of { loc, msg, type } objects, for Pydantic validation
//     errors (e.g. password too short) - happens BEFORE the request ever
//     reaches our handler.
// Rendering the array directly as a React child throws ("Objects are not
// valid as a React child"), which is what looked like a crash. Flatten
// both shapes into a plain string here instead.
function extractErrorMessage(err) {
  const detail = err?.response?.data?.detail

  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join(' · ')
  }

  return err?.message || 'Something went wrong.'
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isRegister = mode === 'register'

  const submit = async () => {
    if (!username || !password || loading) return
    setLoading(true)
    setError('')

    try {
      const { data } = await api.post(
        isRegister ? '/auth/register' : '/auth/login',
        { username: username.trim(), password },
      )

      if (!data.token) {
        setError('Something went wrong - no token returned.')
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.username)
      onLogin(data.token)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(22,163,74,0.08),var(--tw-gradient-to,transparent))] bg-bg px-4">
      <Card className="w-full max-w-sm rounded-lg shadow-glow">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck size={20} className="text-accent" />
          <span className="text-lg font-bold text-text">Liminal</span>
        </div>

        <p className="mb-5 text-sm text-text-dim">
          {isRegister
            ? 'Create an account to get your own private workspace'
            : 'Sign in to your account'}
        </p>

        <Input
          type="text"
          placeholder="Username"
          value={username}
          autoFocus
          autoComplete="username"
          maxLength={64}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-2"
        />

        <Input
          type="password"
          placeholder="Password"
          value={password}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          maxLength={256}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-2"
        />

        {isRegister && (
          <p className="mb-2 text-[11px] text-text-faint">At least 8 characters.</p>
        )}

        {error && (
          <p className="mb-2 text-xs text-danger">{error}</p>
        )}

        <Button
          onClick={submit}
          disabled={!username || !password || loading}
          className="mt-2 w-full"
        >
          {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
        </Button>

        <button
          type="button"
          onClick={() => { setMode(isRegister ? 'login' : 'register'); setError('') }}
          className="mt-3 w-full text-center text-xs text-text-faint hover:text-accent transition-colors"
        >
          {isRegister
            ? 'Already have an account? Log in'
            : "Don't have an account? Sign up"}
        </button>
      </Card>
    </div>
  )
}
