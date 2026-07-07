"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useAppStore } from "@/lib/store";
import { Bot } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { fetchUser, fetchOrganizations, user } = useAppStore();
  const [isInitializing, setIsInitializing] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        if (!user) await fetchUser();
        await fetchOrganizations();
      } catch {
        router.replace("/login");
      } finally {
        setIsInitializing(false);
      }
    };

    init();
  }, [fetchUser, fetchOrganizations, router, user]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 relative z-10">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.60 0.22 268), oklch(0.65 0.20 290))",
            boxShadow: "0 4px 20px oklch(0.60 0.22 268 / 40%)",
            animation: "pulse 2s ease infinite",
          }}
        >
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold gradient-text">AgentOS</p>
          <p className="text-xs text-white/35 mt-0.5">Loading workspace…</p>
        </div>
        {/* Spinner ring */}
        <div
          className="absolute h-[72px] w-[72px] rounded-full border-2 border-transparent animate-spin"
          style={{
            borderTopColor: "oklch(0.65 0.22 268 / 60%)",
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
