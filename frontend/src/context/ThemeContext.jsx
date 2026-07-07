import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('liminal-theme') || 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    try { localStorage.setItem('liminal-theme', theme) } catch {}

    // Apply at the document root (not just some inner div) so the
    // whole page - html/body background included - themes together.
    // Without this, only elements inside a scoped wrapper flip, while
    // the real page background stays put and shows through as a
    // mismatched edge/margin around the app.
    const root = document.documentElement
    root.classList.toggle('theme-dark', theme === 'dark')
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
