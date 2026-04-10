'use client'

import React, { Component, ReactNode } from 'react'
import Image from 'next/image'

interface Props {
  children: ReactNode
  /** Optional fallback — if not provided, uses the default full-screen error UI */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary — catches render errors in child components
 * and shows a friendly "reload" screen instead of a white page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error.message, errorInfo.componentStack)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <Image
              src="/logo.png"
              alt="Project X"
              width={48}
              height={48}
              className="rounded-xl mx-auto mb-5"
              priority
            />
            <h2 className="text-lg font-bold text-white mb-2">Algo salio mal</h2>
            <p className="text-sm text-white/50 mb-6">
              Ha ocurrido un error inesperado. Recarga la pagina para continuar.
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-3 rounded-xl bg-[#E41E2B] text-white text-sm font-semibold hover:bg-[#C41824] transition-colors"
            >
              Recargar
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="mt-6 text-left text-[10px] text-red-400/60 bg-red-500/5 p-3 rounded-lg overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
