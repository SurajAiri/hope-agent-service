"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, MoreHorizontal, Loader2, Users, Mail } from "lucide-react";

type Role = "owner" | "admin" | "member";

interface Member {
  user: { id: string; firstName: string; lastName: string; email: string };
  membership: { id: string; role: Role; status: string };
}

const ROLE_STYLES: Record<Role, { bg: string; text: string; border: string; label: string }> = {
  owner:  { bg: "oklch(0.70 0.16 75 / 12%)",  text: "oklch(0.82 0.14 75)",  border: "oklch(0.70 0.16 75 / 25%)",  label: "Owner"  },
  admin:  { bg: "oklch(0.60 0.20 268 / 12%)", text: "oklch(0.78 0.18 268)", border: "oklch(0.60 0.20 268 / 25%)", label: "Admin"  },
  member: { bg: "oklch(0.50 0.04 268 / 12%)", text: "oklch(0.68 0.04 268)", border: "oklch(0.50 0.04 268 / 20%)", label: "Member" },
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, oklch(0.55 0.22 268), oklch(0.60 0.18 290))",
  "linear-gradient(135deg, oklch(0.50 0.20 295), oklch(0.55 0.16 268))",
  "linear-gradient(135deg, oklch(0.50 0.18 200), oklch(0.55 0.20 230))",
  "linear-gradient(135deg, oklch(0.50 0.16 150), oklch(0.55 0.14 180))",
  "linear-gradient(135deg, oklch(0.55 0.18 50),  oklch(0.55 0.16 80))",
];

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[(name.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length];
}

export default function MembersPage() {
  const { selectedOrgId, user: currentUser, organizations } = useAppStore();
  const currentOrg = organizations.find((o) => o.id === selectedOrgId);
  const canManage = currentOrg?.role === "owner" || currentOrg?.role === "admin";

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const res = await api.get(`/organizations/${selectedOrgId}/members`);
      setMembers(Array.isArray(res) ? res : res.data ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post(`/organizations/${selectedOrgId}/members`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteOpen(false);
      await fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || !selectedOrgId) return;
    setRemoving(true);
    try {
      await api.delete(
        `/organizations/${selectedOrgId}/members/${removeTarget.user.id}`,
      );
      toast.success("Member removed");
      setRemoveTarget(null);
      await fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    } finally {
      setRemoving(false);
    }
  };

  const handleRoleChange = async (userId: string, role: "admin" | "member") => {
    if (!selectedOrgId) return;
    try {
      await api.patch(
        `/organizations/${selectedOrgId}/members/${userId}/role`,
        { role },
      );
      toast.success("Role updated");
      await fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  };

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04]">
          <Users className="h-6 w-6 text-white/50" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="text-sm text-white/70 mt-1">
            You must be an admin or owner to view and manage members.
          </p>
        </div>
      </div>
    );
  }

  const fullName = (m: Member) =>
    `${m.user.firstName} ${m.user.lastName}`.trim();

  const initials = (m: Member) =>
    `${m.user.firstName?.charAt(0) ?? ""}${m.user.lastName?.charAt(0) ?? ""}`.toUpperCase();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Members</h1>
            {!loading && members.length > 0 && (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold"
                style={{
                  background: "oklch(0.65 0.22 268 / 15%)",
                  color: "oklch(0.80 0.18 268)",
                  border: "1px solid oklch(0.65 0.22 268 / 25%)",
                }}
              >
                {members.length}
              </span>
            )}
          </div>
          <p className="text-sm text-white/60 mt-1">
            Manage who has access to this organization.
          </p>
        </div>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger
              render={
                <Button
                  size="sm"
                  className="gap-2 btn-gradient text-white border-0 font-semibold h-9"
                >
                  <UserPlus className="h-4 w-4" />
                  Invite member
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>
                  They&apos;ll receive an invitation to join this organization.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inviteEmail" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                    <Input
                      id="inviteEmail"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inviteRole" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Role
                  </Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as "admin" | "member")}
                  >
                    <SelectTrigger id="inviteRole">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin — can manage members &amp; tokens</SelectItem>
                      <SelectItem value="member">Member — read access only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={inviting || !inviteEmail.trim()} className="btn-gradient text-white border-0 font-semibold">
                    {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send invitation
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "oklch(1 0 0 / 3%)",
          border: "1px solid oklch(1 0 0 / 8%)",
        }}
      >
        {/* Table header */}
        <div
          className="grid gap-4 px-5 py-3 border-b border-white/[0.05]"
          style={{
            gridTemplateColumns: canManage
              ? "minmax(160px,1fr) minmax(160px,1fr) 90px 80px 44px"
              : "minmax(160px,1fr) minmax(160px,1fr) 90px 80px",
            background: "oklch(1 0 0 / 2%)",
          }}
        >
          {["Member", "Email", "Role", "Status", ""].map((h, i) => (
            <span key={i} className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/[0.04]">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-white/50">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "oklch(1 0 0 / 4%)" }}
              >
                <Users className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white/70">No members yet</p>
                <p className="text-xs mt-0.5">Invite your team to get started.</p>
              </div>
            </div>
          ) : (
            members.map((m) => {
              const isCurrentUser = m.user.id === currentUser?.id;
              const roleStyle = ROLE_STYLES[m.membership.role];
              const isActive = m.membership.status === "active";

              return (
                <div
                  key={m.membership.id}
                  className="grid items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
                  style={{
                    gridTemplateColumns: canManage
                      ? "minmax(160px,1fr) minmax(160px,1fr) 90px 80px 44px"
                      : "minmax(160px,1fr) minmax(160px,1fr) 90px 80px",
                  }}
                >
                  {/* Name + avatar */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback
                        className="text-[11px] font-bold text-white"
                        style={{ background: avatarGradient(m.user.firstName ?? "A") }}
                      >
                        {initials(m)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {fullName(m)}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-[10px] text-white/50 font-normal">(you)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Email */}
                  <p className="text-xs text-white/60 truncate">{m.user.email}</p>

                  {/* Role */}
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border"
                    style={{
                      background: roleStyle.bg,
                      color: roleStyle.text,
                      borderColor: roleStyle.border,
                    }}
                  >
                    {roleStyle.label}
                  </span>

                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <span className={`status-dot ${isActive ? "status-dot-active" : "status-dot-pending"}`} />
                    <span className={`text-xs font-medium capitalize ${isActive ? "text-emerald-400" : "text-amber-400"}`}>
                      {m.membership.status}
                    </span>
                  </div>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex justify-end">
                      {!isCurrentUser && m.membership.role !== "owner" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/[0.06]">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-xs"
                              onClick={() => handleRoleChange(m.user.id, m.membership.role === "admin" ? "member" : "admin")}
                            >
                              Change to {m.membership.role === "admin" ? "Member" : "Admin"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-xs text-destructive focus:text-destructive"
                              onClick={() => setRemoveTarget(m)}
                            >
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget ? fullName(removeTarget) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access to this organization immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-destructive hover:bg-destructive/90"
            >
              {removing && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
