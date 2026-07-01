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

export async function analyzeIndicator({ indicator_type, indicator }) {
  try {
    const { data } = await api.post('/analyze/indicator', {
      indicator_type,
      indicator,
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

// --- History (Phase 3) ---------------------------------------------------

export async function getHistory({ limit = 50, verdict, indicator_type } = {}) {
  try {
    const { data } = await api.get('/history', {
      params: { limit, verdict, indicator_type },
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getAnalysisById(id) {
  try {
    const { data } = await api.get(`/history/${id}`)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function deleteAnalysis(id) {
  try {
    const { data } = await api.delete(`/history/${id}`)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Connected Apps -------------------------------------------------------

export async function getIntegrations() {
  try {
    const { data } = await api.get("/integrations/");
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function createIntegration(payload) {
  try {
    const { data } = await api.post("/integrations/", payload);
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function validateIntegration(id) {
  try {
    const { data } = await api.post(`/integrations/${id}/validate`);
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function syncIntegration(id) {
  try {
    const { data } = await api.post(`/integrations/${id}/sync`);
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function deleteIntegration(id) {
  try {
    const { data } = await api.delete(`/integrations/${id}`);
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

// --- GitHub Security ------------------------------------------------------

export async function getGithubSecurity(integrationId) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/github/security`, {
      timeout: 120000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getRepoPeek(integrationId, repoFullName) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/github/repo-peek`, {
      params: { repo: repoFullName },
      timeout: 35000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- MongoDB Atlas ---------------------------------------------------------

export async function getMongoLogs(integrationId) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/mongodb/logs`, {
      timeout: 35000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}
