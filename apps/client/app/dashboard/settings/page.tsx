"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, User, Lock, TriangleAlert } from "lucide-react";

function SectionCard({
  children,
  danger,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "oklch(1 0 0 / 3%)",
        border: danger
          ? "1px solid oklch(0.63 0.22 25 / 25%)"
          : "1px solid oklch(1 0 0 / 8%)",
        boxShadow: danger
          ? "inset 3px 0 0 oklch(0.63 0.22 25 / 40%)"
          : "none",
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  danger,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.05]">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: danger
            ? "oklch(0.63 0.22 25 / 15%)"
            : "oklch(0.65 0.22 268 / 12%)",
          border: danger
            ? "1px solid oklch(0.63 0.22 25 / 25%)"
            : "1px solid oklch(0.65 0.22 268 / 20%)",
        }}
      >
        <Icon
          className="h-4 w-4"
          style={{ color: danger ? "oklch(0.72 0.22 25)" : "oklch(0.78 0.18 268)" }}
        />
      </div>
      <div>
        <p
          className="text-sm font-bold"
          style={{ color: danger ? "oklch(0.72 0.22 25)" : undefined }}
        >
          {title}
        </p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, setUser } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const [profile, setProfile] = useState({
    firstName: user?.name?.split(" ")[0] ?? "",
    lastName:  user?.name?.split(" ").slice(1).join(" ") ?? "",
    email:     user?.email ?? "",
  });

  const [pwd, setPwd] = useState({
    current: "",
    next: "",
    confirm: "",
  });

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put("/users", {
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
      const updated = res.data ?? res;
      setUser({
        ...user!,
        name: `${updated.firstName} ${updated.lastName}`.trim(),
        email: updated.email ?? user!.email,
      });
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) {
      toast.error("New passwords don't match");
      return;
    }
    if (pwd.next.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setChangingPwd(true);
    try {
      await api.put("/users/password", {
        currentPassword: pwd.current,
        newPassword: pwd.next,
      });
      toast.success("Password changed");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setChangingPwd(false);
    }
  };

  const initials = user
    ? `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase()
    : "?";

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-white/45 mt-1">
          Manage your account preferences.
        </p>
      </div>

      {/* Profile */}
      <SectionCard>
        <SectionHeader
          icon={User}
          title="Profile"
          description="Your personal information visible to teammates."
        />
        <div className="px-6 py-6">
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarFallback
                  className="text-xl font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.60 0.22 268), oklch(0.65 0.20 290))",
                  }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Gradient ring */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  boxShadow: "0 0 0 2px oklch(0.07 0.012 268), 0 0 0 4px oklch(0.65 0.22 268 / 40%)",
                }}
              />
            </div>
            <div>
              <p className="text-sm font-bold">{user?.name}</p>
              <p className="text-xs text-white/40">{user?.email}</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  First name
                </Label>
                <Input
                  id="firstName"
                  value={profile.firstName}
                  onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                  required
                  className="h-10 bg-white/[0.04] border-white/[0.08] focus-visible:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Last name
                </Label>
                <Input
                  id="lastName"
                  value={profile.lastName}
                  onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                  className="h-10 bg-white/[0.04] border-white/[0.08] focus-visible:border-primary/50"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="h-10 bg-white/[0.02] border-white/[0.05] text-white/30 cursor-not-allowed"
              />
              <p className="text-[11px] text-white/25">Email address cannot be changed.</p>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="btn-gradient text-white border-0 font-semibold h-9 px-5"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </div>
      </SectionCard>

      {/* Password */}
      <SectionCard>
        <SectionHeader
          icon={Lock}
          title="Password"
          description="Change your account password."
        />
        <div className="px-6 py-6">
          <form onSubmit={handlePasswordChange} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="currentPwd" className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Current password
              </Label>
              <Input
                id="currentPwd"
                type="password"
                placeholder="••••••••"
                value={pwd.current}
                onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                required
                className="h-10 bg-white/[0.04] border-white/[0.08] focus-visible:border-primary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPwd" className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  New password
                </Label>
                <Input
                  id="newPwd"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={pwd.next}
                  onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
                  required
                  minLength={6}
                  className="h-10 bg-white/[0.04] border-white/[0.08] focus-visible:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPwd" className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Confirm password
                </Label>
                <Input
                  id="confirmPwd"
                  type="password"
                  placeholder="••••••••"
                  value={pwd.confirm}
                  onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                  required
                  className="h-10 bg-white/[0.04] border-white/[0.08] focus-visible:border-primary/50"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={changingPwd}
                className="btn-gradient text-white border-0 font-semibold h-9 px-5"
              >
                {changingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
                Change password
              </Button>
            </div>
          </form>
        </div>
      </SectionCard>

      {/* Danger zone */}
      <SectionCard danger>
        <SectionHeader
          icon={TriangleAlert}
          title="Danger zone"
          description="Irreversible actions — proceed with extreme caution."
          danger
        />
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Delete account</p>
              <p className="text-xs text-white/40 mt-0.5">
                Permanently remove your account and all associated data.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-9 px-4 font-semibold"
                  >
                    Delete account
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your account, all your organizations where
                    you are the sole owner, and all associated data. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90">
                    Yes, delete my account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
