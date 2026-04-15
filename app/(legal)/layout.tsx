import Link from 'next/link'
import Image from 'next/image'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <Link href="/home" className="text-primary hover:text-primary-light transition-colors text-sm">
          &larr; Volver
        </Link>
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Project X" width={24} height={24} className="rounded-md" />
          <span className="text-sm font-bold text-white/80">Project X</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-8">
        {children}
      </main>
      <footer className="border-t border-white/[0.06] py-6 text-center">
        <p className="text-xs text-white/30">
          &copy; {new Date().getFullYear()}{' '}Project X — JV Group Premium Events &amp; Business S.L.
        </p>
      </footer>
    </div>
  )
}
