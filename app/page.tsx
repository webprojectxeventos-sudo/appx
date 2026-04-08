"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          router.push("/home");
        } else {
          router.push("/login");
        }
      } catch (error) {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/[0.07] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-gold/[0.05] blur-[120px] pointer-events-none" />

      {loading && (
        <div className="flex flex-col items-center gap-5 animate-fade-in relative z-10">
          <div className="animate-float">
            <Image src="/logo.png" alt="Project X" width={64} height={64} className="rounded-xl" priority />
          </div>
          <h1 className="text-3xl font-bold tracking-widest text-gradient-primary">PROJECT X</h1>
          <p className="text-sm text-accent-gradient font-medium">Tu graduacion, tu noche</p>

          {/* Single red glow dot */}
          <div className="w-2 h-2 rounded-full bg-primary animate-glow-pulse mt-2" />

          {/* Animated gradient bar */}
          <div className="h-0.5 w-32 bg-gradient-to-r from-transparent via-primary to-transparent animate-gradient-shift rounded-full" />
        </div>
      )}
    </div>
  );
}
