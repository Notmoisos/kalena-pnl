'use client'
import React, { useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import LoginButton from './LoginButton'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(undefined)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u))
    return unsubscribe
  }, [])

  if (user === undefined) return null // loading state
  if (!user) return <div className="flex items-center justify-center h-screen"><LoginButton /></div>

  return (
    <div>
      <div className="p-4 flex justify-end">
        <span className="mr-4">{user.email}</span>
        <button onClick={() => signOut(auth)} className="px-2 py-1 border rounded">Sign out</button>
      </div>
      {children}
    </div>
  )
} 