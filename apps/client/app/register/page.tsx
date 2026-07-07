"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Bot, Mail, Lock, User } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await api.post("/auth/register", form);
      const token = res?.data?.token ?? res?.token;
      if (!token) throw new Error("No token received");
      localStorage.setItem("token", token);
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
      <div className="w-full max-w-[400px]">
        {/* Logo + headline */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.60 0.22 268), oklch(0.65 0.20 290))",
              boxShadow: "0 4px 24px oklch(0.60 0.22 268 / 45%)",
            }}
          >
            <Bot className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold gradient-text tracking-tight">AgentOS</h1>
            <p className="text-sm text-white/40 mt-1">Create your account</p>
          </div>
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl p-8 space-y-6"
          style={{
            background: "oklch(1 0 0 / 3.5%)",
            backdropFilter: "blur(16px)",
            border: "1px solid oklch(1 0 0 / 9%)",
            boxShadow: "0 4px 32px oklch(0 0 0 / 40%), inset 0 1px 0 oklch(1 0 0 / 6%)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  First name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25 pointer-events-none" />
                  <Input
                    id="firstName"
                    placeholder="John"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="pl-9 h-11 bg-white/[0.04] border-white/[0.08] text-sm placeholder:text-white/25 focus-visible:border-primary/50 focus-visible:bg-white/[0.06] transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Last name
                </Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="h-11 bg-white/[0.04] border-white/[0.08] text-sm placeholder:text-white/25 focus-visible:border-primary/50 focus-visible:bg-white/[0.06] transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="pl-10 h-11 bg-white/[0.04] border-white/[0.08] text-sm placeholder:text-white/25 focus-visible:border-primary/50 focus-visible:bg-white/[0.06] transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25 pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="pl-10 h-11 bg-white/[0.04] border-white/[0.08] text-sm placeholder:text-white/25 focus-visible:border-primary/50 focus-visible:bg-white/[0.06] transition-all"
                />
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold btn-gradient text-white border-0"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-white/35 mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-white/70 hover:text-white underline underline-offset-4 transition-colors font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
