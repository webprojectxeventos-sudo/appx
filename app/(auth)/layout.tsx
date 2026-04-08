import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-5 py-12 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-30%] left-[-15%] w-[50vw] h-[50vw] rounded-full bg-primary/[0.04] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[40vw] h-[40vw] rounded-full bg-gold/[0.03] blur-[120px] pointer-events-none" />

      {/* Logo */}
      <div className="mb-8 relative z-10">
        <Image src="/logo.png" alt="Project X" width={72} height={72} className="rounded-2xl" priority />
      </div>

      {/* Auth Content */}
      <div className="w-full max-w-[340px] relative z-10">{children}</div>

      {/* Branding */}
      <p className="mt-10 text-[11px] text-white/20 relative z-10">
        <span className="text-white/30 font-medium">Project X</span> by TuGraduacionMadrid
      </p>
    </div>
  )
}
