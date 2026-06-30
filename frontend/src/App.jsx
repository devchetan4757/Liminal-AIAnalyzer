import { useState } from 'react'
import ChatWindow from './components/ChatWindow'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import ManualAnalysisPage from './pages/ManualAnalysisPage'
import HistoryPage from './pages/HistoryPage'

export default function App() {
  // Manual Analysis is the landing view -- Liminal (chat) is one section
  // among others, not the default entry point.
  const [section, setSection] = useState('manual')

  return (
    <ProtectedRoute>
      <div className="flex h-screen w-full bg-bg">
        <Sidebar active={section} onSelect={setSection} />

        <div className="flex-1 overflow-hidden">
          {section === 'manual' && (
            <ManualAnalysisPage onAskLiminal={() => setSection('chat')} />
          )}
          {section === 'chat' && <ChatWindow />}
          {section === 'history' && <HistoryPage />}
        </div>
      </div>
    </ProtectedRoute>
  )
}
