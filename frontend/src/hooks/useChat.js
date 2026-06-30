import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyzeHash,
  analyzeUpload,
  checkSandboxStatus,
  resetSessionId,
  sendMessage,
} from '../api/client'
import { sha256OfFile } from '../utils/hash'

let idCounter = 0
const nextId = () => `m-${++idCounter}`

const POLL_INTERVAL_MS = 15000 // ~15s between checks, stays well under VT's free 4/min limit

const STATUS_LABELS = {
  queued: 'Queued for sandbox analysis…',
  'in progress': 'Detonating in sandbox, analyzing behavior…',
}

export function useChat() {
  const [messages, setMessages] = useState([])
  const [pendingFile, setPendingFile] = useState(null)
  const [loading, setLoading] = useState(false)

  const pollTimeoutRef = useRef(null)

  const pushMessage = useCallback((msg) => {
    const id = nextId()
    setMessages((prev) => [...prev, { id, ...msg }])
    return id
  }, [])

  const updateMessage = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    )
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  // Stop any in-flight polling if the component unmounts
  useEffect(() => stopPolling, [stopPolling])

  const pollSandboxStatus = useCallback(
    (messageId) => {
      const tick = async () => {
        try {
          const result = await checkSandboxStatus()

          if (result.type === 'sandbox_status') {
            const label = STATUS_LABELS[result.status] || `Status: ${result.status}…`
            updateMessage(messageId, { type: 'text', content: label, sandboxPending: true })
            pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_MS)
            return
          }

          // Done -- result is either a full "analysis" card or a "text" fallback
          updateMessage(messageId, { ...result, sandboxPending: false })
        } catch (err) {
          updateMessage(messageId, {
            type: 'text',
            content: `Sandbox check failed: ${err.message}`,
            sandboxPending: false,
          })
        }
      }
      tick()
    },
    [updateMessage],
  )

  const submitText = useCallback(
    async (text) => {
      if (!text.trim()) return
      pushMessage({ role: 'user', type: 'text', content: text })
      setLoading(true)
      try {
        const result = await sendMessage(text)
        pushMessage({ role: 'bot', ...result })
      } catch (err) {
        pushMessage({
          role: 'bot',
          type: 'text',
          content: `Could not reach the backend: ${err.message}`,
        })
      } finally {
        setLoading(false)
      }
    },
    [pushMessage],
  )

  const submitFile = useCallback(
    async (file) => {
      pushMessage({ role: 'user', type: 'file', content: file.name })
      setLoading(true)
      try {
        const hash = await sha256OfFile(file)
        const result = await analyzeHash({ hash, filename: file.name, size: file.size })
        if (result.found === false) {
          setPendingFile(file)
          pushMessage({
            role: 'bot',
            type: 'text',
            content: `This file's hash (${hash.slice(0, 16)}…) wasn't found in any free database.`,
            offerUpload: true,
          })
        } else {
          pushMessage({ role: 'bot', ...result })
        }
      } catch (err) {
        pushMessage({
          role: 'bot',
          type: 'text',
          content: `Could not hash or look up that file: ${err.message}`,
        })
      } finally {
        setLoading(false)
      }
    },
    [pushMessage],
  )

  const confirmUpload = useCallback(async () => {
    if (!pendingFile) return
    const file = pendingFile
    setPendingFile(null)
    setLoading(true)
    try {
      const result = await analyzeUpload(file)

      if (result.type === 'sandbox_pending') {
        const messageId = pushMessage({
          role: 'bot',
          type: 'text',
          content: result.content,
          sandboxPending: true,
        })
        setLoading(false)
        pollTimeoutRef.current = setTimeout(() => pollSandboxStatus(messageId), POLL_INTERVAL_MS)
        return
      }

      pushMessage({ role: 'bot', ...result })
    } catch (err) {
      pushMessage({
        role: 'bot',
        type: 'text',
        content: `Upload scan failed: ${err.message}`,
      })
    } finally {
      setLoading(false)
    }
  }, [pendingFile, pushMessage, pollSandboxStatus])

  const clearChat = useCallback(() => {
    stopPolling()
    setMessages([])
    setPendingFile(null)
    resetSessionId()
  }, [stopPolling])

  return {
    messages,
    loading,
    submitText,
    submitFile,
    confirmUpload,
    clearChat,
    hasPendingFile: !!pendingFile,
  }
}
