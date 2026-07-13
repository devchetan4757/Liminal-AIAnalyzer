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
  const detail = err?.response?.data?.detail

  if (typeof detail === 'string') return detail

  // FastAPI/Pydantic validation errors (422) come back as an array of
  // { loc, msg, type } objects, not a string - rendering that array
  // directly in JSX throws ("Objects are not valid as a React child").
  // Flatten it into a readable string instead.
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join(' · ')
  }

  return err?.message || 'Unknown error'
}

// --- Auth ------------------------------------------------------------

export async function login(username, password) {
  try {
    const { data } = await api.post('/auth/login', { username, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', data.username)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function register(username, password) {
  try {
    const { data } = await api.post('/auth/register', { username, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', data.username)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getCurrentUser() {
  try {
    const { data } = await api.get('/auth/me')
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
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

// --- Render -----------------------------------------------------------

export async function getRenderStatus(integrationId, { refresh = false } = {}) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/render/status`, {
      params: { refresh },
      timeout: 50000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// On-demand raw log lines for a single service - fetched only when
// the user opens that service's log panel, separate from the cached
// status/summary poll above.
export async function getRenderServiceLogs(integrationId, serviceId, { limit = 100, type } = {}) {
  try {
    const { data } = await api.get(
      `/integrations/${integrationId}/render/services/${serviceId}/logs`,
      { params: { limit, type }, timeout: 35000 },
    )
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// Settings-form operations (create) - separate from the one-click
// redeploy/rollback/cancel/suspend/resume/restart/scale actions, which
// go through triggerRemoteAction below.

export async function getRenderOwners(integrationId) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/render/owners`, {
      timeout: 20000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function createRenderService(integrationId, payload) {
  try {
    const { data } = await api.post(
      `/integrations/${integrationId}/render/services`,
      payload,
      { timeout: 45000 },
    )
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Netlify ------------------------------------------------------------

export async function getNetlifyStatus(integrationId, { refresh = false } = {}) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/netlify/status`, {
      params: { refresh },
      timeout: 50000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Vercel ---------------------------------------------------------------

export async function getVercelStatus(integrationId, { refresh = false } = {}) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/vercel/status`, {
      params: { refresh },
      timeout: 50000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Supabase ---------------------------------------------------------------

export async function getSupabaseStatus(integrationId, { refresh = false } = {}) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/supabase/status`, {
      params: { refresh },
      timeout: 50000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Remote Actions (mutating, registry-driven, shared across providers) -

export async function getActionRegistry(provider) {
  try {
    const { data } = await api.get('/remote-actions/registry', { params: { provider } })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getRemoteActions({ integrationId, provider, incidentId, limit } = {}) {
  try {
    const { data } = await api.get('/remote-actions', {
      params: { integration_id: integrationId, provider, incident_id: incidentId, limit },
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function triggerRemoteAction(payload) {
  try {
    const { data } = await api.post('/remote-actions', payload, { timeout: 35000 })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- UptimeRobot ------------------------------------------------------

export async function getUptimeRobotStatus(integrationId, { refresh = false } = {}) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/uptimerobot/status`, {
      params: { refresh },
      timeout: 35000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// Settings-form operations (create/edit) - separate from the one-click
// pause/resume/reset/delete actions, which go through triggerRemoteAction
// above via the shared /api/remote-actions endpoint.

export async function getUptimeRobotMonitor(integrationId, monitorId) {
  try {
    const { data } = await api.get(
      `/integrations/${integrationId}/uptimerobot/monitors/${monitorId}`,
      { timeout: 20000 },
    )
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function createUptimeRobotMonitor(integrationId, payload) {
  try {
    const { data } = await api.post(
      `/integrations/${integrationId}/uptimerobot/monitors`,
      payload,
      { timeout: 35000 },
    )
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function updateUptimeRobotMonitor(integrationId, monitorId, payload) {
  try {
    const { data } = await api.patch(
      `/integrations/${integrationId}/uptimerobot/monitors/${monitorId}`,
      payload,
      { timeout: 35000 },
    )
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Neon ---------------------------------------------------------------

export async function getNeonStatus(integrationId, { refresh = false } = {}) {
  try {
    const { data } = await api.get(`/integrations/${integrationId}/neon/status`, {
      params: { refresh },
      timeout: 50000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Watchlist --------------------------------------------------------

export async function addToWatchlist(payload) {
  try {
    const { data } = await api.post('/watchlist', payload, { timeout: 45000 })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getWatchlist({ status } = {}) {
  try {
    const { data } = await api.get('/watchlist', { params: { status } })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function resolveWatchlistItem(id) {
  try {
    const { data } = await api.post(`/watchlist/${id}/resolve`)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function deleteWatchlistItem(id) {
  try {
    const { data } = await api.delete(`/watchlist/${id}`)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

// --- Security Posture -----------------------------------------------------
// Append this block to src/api/client.js (e.g. right after the Watchlist
// section) -- not a standalone file, just kept separate here for a clean
// diff. Talks to backend/app/routers/posture.py.

export async function getPosture(integrationId) {
  try {
    const { data } = await api.get(`/posture/${integrationId}`)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getPostureHistory(integrationId, { limit } = {}) {
  try {
    const { data } = await api.get(`/posture/${integrationId}/history`, {
      params: { limit },
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function triggerPostureScan(integrationId) {
  try {
    const { data } = await api.post(`/posture/${integrationId}/scan`, null, {
      timeout: 45000,
    })
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function resolveFinding(findingId) {
  try {
    const { data } = await api.post(`/posture/findings/${findingId}/resolve`)
    return data
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}
