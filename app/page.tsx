"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
      <h1
        className="text-[clamp(2.5rem,8vw,5rem)] font-black tracking-[0.15em] bg-[linear-gradient(110deg,#7a7a7a_25%,#ffffff_50%,#7a7a7a_75%)] bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer select-none"
        style={{ fontFamily: 'var(--font-geist-sans)' }}
      >
        PROJECT X
      </h1>
    </div>
  );
}
