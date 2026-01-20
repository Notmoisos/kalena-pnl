'use client'
import React, { useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import LoginButton from './LoginButton'

const ALLOWED_USERS = [
  'alan@kalenafoods.com.br',
  'financeiro@kalenafoods.com.br',
  'danny@kalenafoods.com.br',
  'eilon@kalenafoods.com.br',
  'gaspar@datime.com.br',
]

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(undefined)
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (user && user.email && !ALLOWED_USERS.includes(user.email)) {
      setBlockedEmail(user.email)
      signOut(auth)
    }
  }, [user])

  if (blockedEmail) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Acesso não autorizado</p>
          <p className="text-sm text-gray-600">
            O e-mail <span className="font-mono">{blockedEmail}</span> não possui permissão para acessar este painel.
          </p>
        </div>
      </div>
    )
  }

  if (user === undefined) return null

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoginButton />
      </div>
    )
  }

  return (
    <div>
      <div className="p-4 flex justify-end">
        <span className="mr-4">{user.email}</span>
        <button onClick={() => signOut(auth)} className="px-2 py-1 border rounded">
          Sign out
        </button>
      </div>
      {children}
    </div>
  )
}
