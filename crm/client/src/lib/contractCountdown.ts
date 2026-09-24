import { useEffect, useState } from 'react'
import { Contract } from '../types'

const DAY_MS = 86400000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const validDateKey = (value: string) => {
  if (!ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const dayDifference = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS)

export interface ContractCountdown {
  daysUntilEnd: number
  durationDays: number
  label: string
  phase: 'upcoming' | 'active' | 'ending' | 'ended'
}

export function getContractCountdown(contract: Contract, today = localDateKey()): ContractCountdown | null {
  if (contract.type !== 'locacao' || contract.status !== 'assinado') return null
  if (!validDateKey(contract.startDate) || !validDateKey(contract.endDate) || contract.endDate < contract.startDate || !validDateKey(today)) return null

  const daysUntilStart = dayDifference(today, contract.startDate)
  const daysUntilEnd = dayDifference(today, contract.endDate)
  const durationDays = dayDifference(contract.startDate, contract.endDate) + 1
  if (daysUntilStart > 0) {
    return { daysUntilEnd, durationDays, label: `Inicia em ${daysUntilStart} ${daysUntilStart === 1 ? 'dia' : 'dias'}`, phase: 'upcoming' }
  }
  if (daysUntilEnd < 0) {
    const elapsed = Math.abs(daysUntilEnd)
    return { daysUntilEnd, durationDays, label: `Prazo encerrado há ${elapsed} ${elapsed === 1 ? 'dia' : 'dias'}`, phase: 'ended' }
  }
  if (daysUntilEnd === 0) return { daysUntilEnd, durationDays, label: 'Termina hoje', phase: 'ending' }
  return {
    daysUntilEnd,
    durationDays,
    label: `${daysUntilEnd} ${daysUntilEnd === 1 ? 'dia restante' : 'dias restantes'}`,
    phase: daysUntilEnd <= 14 ? 'ending' : 'active',
  }
}

export function getUpcomingSignedRentals(contracts: Contract[], today = localDateKey(), limit = 4) {
  return contracts
    .flatMap((contract) => {
      const countdown = getContractCountdown(contract, today)
      return countdown && countdown.daysUntilEnd >= 0 && countdown.daysUntilEnd <= 60 && countdown.phase !== 'upcoming'
        ? [{ contract, countdown }]
        : []
    })
    .sort((left, right) => left.countdown.daysUntilEnd - right.countdown.daysUntilEnd)
    .slice(0, limit)
}

export function useLocalDateKey() {
  const [today, setToday] = useState(() => localDateKey())

  useEffect(() => {
    let timeoutId: number | undefined
    const refreshAndSchedule = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      const now = new Date()
      setToday(localDateKey(now))
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
      timeoutId = window.setTimeout(refreshAndSchedule, Math.max(1000, nextMidnight - now.getTime() + 50))
    }
    refreshAndSchedule()
    window.addEventListener('focus', refreshAndSchedule)
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      window.removeEventListener('focus', refreshAndSchedule)
    }
  }, [])

  return today
}
