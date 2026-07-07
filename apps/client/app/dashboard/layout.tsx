"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useAppStore } from "@/lib/store";
import { Bot, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

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
          <p className="text-sm font-semibold gradient-text">Hope</p>
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
    <div className="flex h-screen flex-col md:flex-row overflow-hidden">
      {/* Mobile Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.05] md:hidden bg-background shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{
              background: "linear-gradient(135deg, oklch(0.60 0.22 268), oklch(0.65 0.20 290))",
              boxShadow: "0 2px 8px oklch(0.60 0.22 268 / 40%)",
            }}
          >
            <Bot className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight gradient-text">
            Hope
          </span>
        </div>
        <Sheet>
          <SheetTrigger render={<button className="p-2 -mr-2 text-white/70 hover:text-white" />}>
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] p-0 border-r border-white/[0.05] bg-[var(--sidebar)]">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar />
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="mx-auto max-w-5xl px-4 md:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
