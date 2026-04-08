import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/[0.07] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-gold/[0.05] blur-[120px] pointer-events-none" />

      {/* Logo */}
      <div className="mb-6 animate-float relative z-10">
        <Image src="/logo.png" alt="Project X" width={96} height={96} className="rounded-2xl" priority />
      </div>

      {/* Brand name */}
      <h1 className="text-2xl font-bold text-gradient-primary tracking-tight mb-8 relative z-10">Project X</h1>

      {/* Auth Content */}
      <div className="w-full max-w-sm animate-scale-in relative z-10">{children}</div>

      {/* Branding */}
      <p className="mt-8 text-[11px] text-white-muted animate-fade-in relative z-10">
        <span className="text-accent-gradient font-medium">Project X</span> <span className="text-white-muted/50">by</span> TuGraduacionMadrid
      </p>
    </div>
  )
}
