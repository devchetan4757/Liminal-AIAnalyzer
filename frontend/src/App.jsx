import ChatWindow from './components/ChatWindow'
import ProtectedRoute from './components/ProtectedRoute'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { Badge } from './components/ui/Badge'

export default function App() {
  return (
    <>

      <ProtectedRoute>
        <ChatWindow />
      </ProtectedRoute>
    </>
  )
}
