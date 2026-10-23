import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from './db.js'
import { publicUser } from './screenAccess.js'

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
  if (!user || user.active === false || !user.passwordHash) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  const token = signToken(user)
  return {
    user: publicUser(user),
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

    // O cadastro atual manda sobre o token: perfil alterado ou usuário
    // desativado vale na hora, sem esperar o token expirar.
    const stored = db.find('users', (u) => u.id === decoded.id)
    if (stored && stored.active === false) {
      return res.status(401).json({ error: 'Usuário desativado. Fale com o administrador.' })
    }
    const current = stored
      ? { ...decoded, name: stored.name, email: stored.email, role: stored.role }
      : decoded

    if (roles.length > 0 && !roles.includes(current.role)) {
      return res.status(403).json({ error: 'Acesso restrito para o seu perfil de usuário.' })
    }

    req.user = current
    next()
  }
}
