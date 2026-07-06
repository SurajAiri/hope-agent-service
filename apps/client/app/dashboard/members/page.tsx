"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { UserPlus, MoreHorizontal, Loader2, Users } from "lucide-react";

type Role = "owner" | "admin" | "member";

interface Member {
  user: { id: string; firstName: string; lastName: string; email: string };
  membership: { id: string; role: Role; status: string };
}

const ROLE_COLORS: Record<Role, string> = {
  owner:  "text-amber-400 bg-amber-400/10 border-amber-400/20",
  admin:  "text-blue-400  bg-blue-400/10  border-blue-400/20",
  member: "text-zinc-400  bg-zinc-400/10  border-zinc-400/20",
};

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
      await api.put(`/organizations/${selectedOrgId}/members/${userId}/role`, { role });
      toast.success("Role updated");
      await fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  };

  const fullName = (m: Member) =>
    `${m.user.firstName} ${m.user.lastName}`.trim();

  const initials = (m: Member) =>
    `${m.user.firstName?.charAt(0) ?? ""}${m.user.lastName?.charAt(0) ?? ""}`.toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has access to this organization.
          </p>
        </div>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <UserPlus className="h-4 w-4" />
                Invite member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>
                  They&apos;ll receive an invitation to join this organization.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inviteEmail">Email address</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inviteRole">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as "admin" | "member")}
                  >
                    <SelectTrigger id="inviteRole">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin — can manage members & tokens</SelectItem>
                      <SelectItem value="member">Member — read access only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
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
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="text-xs">Member</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {canManage && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  {canManage && <TableCell />}
                </TableRow>
              ))
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No members yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
                const isCurrentUser = m.user.id === currentUser?.id;
                return (
                  <TableRow key={m.membership.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 border border-border">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                            {initials(m)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {fullName(m)}
                          {isCurrentUser && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.user.email}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize ${ROLE_COLORS[m.membership.role]}`}>
                        {m.membership.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.membership.status === "active" ? "default" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {m.membership.status}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {!isCurrentUser && m.membership.role !== "owner" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
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
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
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
