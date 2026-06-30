import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

const SESSION_KEY = 'malware-chatbot-session-id'

export function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function resetSessionId() {
  const id = crypto.randomUUID()
  sessionStorage.setItem(SESSION_KEY, id)
  return id
}

function extractErrorMessage(err) {
  return err?.response?.data?.detail || err?.message || 'Unknown error'
}

export async function sendMessage(text) {
  try {
    const { data } = await api.post('/chat/message', {
      text,
      session_id: getSessionId(),
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function analyzeHash({ hash, filename, size }) {
  try {
    const { data } = await api.post('/analyze/hash', {
      hash,
      filename,
      size,
      session_id: getSessionId(),
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function analyzeUpload(file) {
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('session_id', getSessionId())

    const { data } = await api.post('/analyze/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function checkSandboxStatus() {
  try {
    const { data } = await api.get('/analyze/sandbox-status', {
      params: { session_id: getSessionId() },
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}
