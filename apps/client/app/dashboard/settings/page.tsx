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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Loader2, User, Lock } from "lucide-react";

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
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account preferences.
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12 border border-border">
              <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">
                <User className="inline h-4 w-4 mr-1.5 text-muted-foreground" />
                Profile
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Your personal information.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs">First name</Label>
                <Input
                  id="firstName"
                  value={profile.firstName}
                  onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs">Last name</Label>
                <Input
                  id="lastName"
                  value={profile.lastName}
                  onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Email cannot be changed.
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">
            <Lock className="inline h-4 w-4 mr-1.5 text-muted-foreground" />
            Password
          </CardTitle>
          <CardDescription className="text-xs">
            Change your account password.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPwd" className="text-xs">Current password</Label>
              <Input
                id="currentPwd"
                type="password"
                placeholder="••••••••"
                value={pwd.current}
                onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPwd" className="text-xs">New password</Label>
              <Input
                id="newPwd"
                type="password"
                placeholder="Minimum 6 characters"
                value={pwd.next}
                onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPwd" className="text-xs">Confirm new password</Label>
              <Input
                id="confirmPwd"
                type="password"
                placeholder="••••••••"
                value={pwd.confirm}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={changingPwd}>
                {changingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
                Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription className="text-xs">
            Irreversible actions. Proceed with caution.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-destructive/20" />
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently remove your account and all associated data.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  Delete account
                </Button>
              </AlertDialogTrigger>
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
        </CardContent>
      </Card>
    </div>
  );
}
