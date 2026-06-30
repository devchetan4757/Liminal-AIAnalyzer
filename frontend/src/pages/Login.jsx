import { useState } from 'react'
import axios from 'axios'
import { ShieldCheck } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

const api = axios.create({ baseURL: '/api' })

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!password || loading) return
    setLoading(true)
    setError('')

    try {
      const { data } = await api.post('/auth/login', { password })

      if (!data.token) {
        setError('Wrong password')
        return
      }

      localStorage.setItem('token', data.token)
      onLogin(data.token)
    } catch (err) {
      setError('Login failed')
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
          Enter access key to continue
        </p>

        <Input
          type="password"
          placeholder="Password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-2"
        />

        {error && (
          <p className="mb-2 text-xs text-danger">{error}</p>
        )}

        <Button
          onClick={submit}
          disabled={!password || loading}
          className="mt-2 w-full"
        >
          {loading ? 'Checking…' : 'Login'}
        </Button>
      </Card>
    </div>
  )
}
