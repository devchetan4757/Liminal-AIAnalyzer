import { useEffect, useState } from "react"
import Login from "../pages/Login"

export default function ProtectedRoute({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"))

  useEffect(() => {
    const sync = () => setToken(localStorage.getItem("token"))
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  if (!token) {
    return <Login onLogin={() => setToken(localStorage.getItem("token"))} />
  }

  return children
}
