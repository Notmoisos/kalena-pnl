'use client'
import React, { useState } from 'react'
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function LoginButton() {
  const [error, setError] = useState<string | null>(null)
  const handleLogin = async () => {
    setError(null)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await signInWithPopup(auth, provider)
    } catch (err: any) {
      console.error('Login error:', err)
      const msg = err.message || 'Login failed'
      if (msg.includes('Unauthorized email')) {
        setError('Your email domain is not allowed.')
      } else {
        setError(msg)
      }
    }
  }

  return (
    <div>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <button
        onClick={handleLogin}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Sign in with Google
      </button>
    </div>
  )
} 