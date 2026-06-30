import { useState } from "react"
import "./login.css"
import axios from "axios"

const api = axios.create({
  baseURL: "/api",
})

export default function Login({ onLogin }) {
  const [password, setPassword] = useState("")

  const submit = async () => {
    try {
      const { data } = await api.post("/auth/login", { password })

      if (!data.token) {
        alert("Wrong password")
        return
      }

      localStorage.setItem("token", data.token)
      onLogin(data.token)
    } catch (err) {
      alert("Login failed")
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-title">Liminal</div>
        <div className="login-subtitle">
          Enter access key to continue
        </div>

        <input
          className="login-input"
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="login-button" onClick={submit}>
          Login
        </button>
      </div>
    </div>
  )
}
