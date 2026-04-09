'use client'

import React, { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'

function ScannerLayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, profile, loading, initialized, isStaff } = useAuth()

  useEffect(() => {
    if (!initialized || loading) return
    if (!user || !profile) {
      router.push('/login')
      return
    }
    if (!isStaff) {
      router.push('/home')
    }
  }, [user, profile, initialized, loading, isStaff, router])

  if (!initialized || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background min-h-screen">
        <div className="text-center animate-fade-in">
          <Image src="/logo.png" alt="Project X" width={48} height={48} className="rounded-xl mx-auto mb-4" priority />
          <div className="flex items-center gap-1.5 justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    )
  }

  if (!user || !profile || !isStaff) {
    return null
  }

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black-border bg-[#0e0e0e]/90 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Project X" width={28} height={28} className="rounded-lg" />
          <h1 className="font-bold text-sm text-white">Scanner</h1>
        </div>
        <span className="text-xs text-white-muted">{profile.full_name}</span>
      </header>

      <main className="p-4">
        {children}
      </main>
    </div>
  )
}

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return <ScannerLayoutContent>{children}</ScannerLayoutContent>
}
