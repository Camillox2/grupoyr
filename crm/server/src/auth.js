import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado. Defina um segredo forte no arquivo server/.env.')
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (e) {
    return null
  }
}

export async function loginUser(email, password) {
  const user = db.find('users', (u) => u.email.toLowerCase() === email.toLowerCase())
  if (!user) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  const token = signToken(user)
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  }
}

export function requireAuth(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Acesso não autorizado. Faça login.' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = verifyToken(token)
    if (!decoded) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida.' })
    }

    if (roles.length > 0 && !roles.includes(decoded.role)) {
      return res.status(403).json({ error: 'Acesso restrito para o seu perfil de usuário.' })
    }

    req.user = decoded
    next()
  }
}
