"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { user, initialized, loading, isAdmin } = useAuth();

  useEffect(() => {
    if (!initialized || loading) return;
    if (!user) { router.replace("/login"); return; }
    router.replace(isAdmin ? "/admin/dashboard" : "/home");
  }, [initialized, loading, user, isAdmin, router]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/[0.07] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-gold/[0.05] blur-[120px] pointer-events-none" />

      <div className="flex flex-col items-center gap-5 animate-fade-in relative z-10">
        <div className="animate-float">
          <Image src="/logo.png" alt="Project X" width={64} height={64} className="rounded-xl" priority />
        </div>
        <h1 className="text-3xl font-bold tracking-widest text-gradient-primary">PROJECT X</h1>
        <p className="text-sm text-accent-gradient font-medium">Tu graduacion, tu noche</p>
        <div className="w-2 h-2 rounded-full bg-primary animate-glow-pulse mt-2" />
        <div className="h-0.5 w-32 bg-gradient-to-r from-transparent via-primary to-transparent animate-gradient-shift rounded-full" />
      </div>
    </div>
  );
}
