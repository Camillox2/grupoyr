import React, { createContext, useContext, useState, useEffect } from 'react'
import { User } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, pass: string) => Promise<boolean>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: async () => false,
  logout: () => {},
  loading: true,
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('yr_crm_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const savedToken = localStorage.getItem('yr_crm_token')
      if (savedToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          })
          if (res.ok) {
            const data = await res.json()
            setUser(data.user)
            setToken(savedToken)
          } else {
            localStorage.removeItem('yr_crm_token')
            setUser(null)
            setToken(null)
          }
        } catch {
          localStorage.removeItem('yr_crm_token')
          setUser(null)
          setToken(null)
        }
      } else {
        setUser(null)
        setToken(null)
      }
      setLoading(false)
    }

    checkAuth()
  }, [])

  const login = async (email: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: pass }),
      })

      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
        setToken(data.token)
        localStorage.setItem('yr_crm_token', data.token)
        return true
      }
    } catch (e) {
      console.warn('Falha de comunicação com o servidor de autenticação:', e)
    }

    return false
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('yr_crm_token')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
