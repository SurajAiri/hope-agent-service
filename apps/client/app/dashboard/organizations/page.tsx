"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Building2, Loader2, Check, Users } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

const ORG_GRADIENTS = [
  "linear-gradient(135deg, oklch(0.55 0.22 268), oklch(0.60 0.18 290))",
  "linear-gradient(135deg, oklch(0.50 0.20 295), oklch(0.55 0.16 268))",
  "linear-gradient(135deg, oklch(0.50 0.18 200), oklch(0.55 0.20 230))",
  "linear-gradient(135deg, oklch(0.50 0.16 150), oklch(0.55 0.14 180))",
  "linear-gradient(135deg, oklch(0.55 0.18 50),  oklch(0.55 0.16 80))",
];

function orgGradient(name: string) {
  return ORG_GRADIENTS[(name.charCodeAt(0) ?? 0) % ORG_GRADIENTS.length];
}

const ROLE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  owner:  { bg: "oklch(0.70 0.16 75 / 12%)",  text: "oklch(0.82 0.14 75)",  border: "oklch(0.70 0.16 75 / 25%)" },
  admin:  { bg: "oklch(0.60 0.20 268 / 12%)", text: "oklch(0.78 0.18 268)", border: "oklch(0.60 0.20 268 / 25%)" },
  member: { bg: "oklch(0.50 0.04 268 / 12%)", text: "oklch(0.68 0.04 268)", border: "oklch(0.50 0.04 268 / 20%)" },
};

export default function OrganizationsPage() {
  const { organizations, selectedOrgId, setSelectedOrgId, fetchOrganizations } =
    useAppStore();
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post("/organizations", form);
      const newOrg = res.data ?? res;
      toast.success(`"${form.name}" created`);
      setCreateOpen(false);
      setForm({ name: "", slug: "" });
      await fetchOrganizations();
      setSelectedOrgId(newOrg.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/organizations/${deleteTarget.id}`);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await fetchOrganizations();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete organization");
    } finally {
      setDeleting(false);
    }
  };

  const handleNameChange = (name: string) => {
    setForm({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
            {organizations.length > 0 && (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold"
                style={{
                  background: "oklch(0.65 0.22 268 / 15%)",
                  color: "oklch(0.80 0.18 268)",
                  border: "1px solid oklch(0.65 0.22 268 / 25%)",
                }}
              >
                {organizations.length}
              </span>
            )}
          </div>
          <p className="text-sm text-white/60 mt-1">
            Manage the organizations you belong to.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button size="sm" className="gap-2 btn-gradient text-white border-0 font-semibold h-9">
                <Plus className="h-4 w-4" />
                New organization
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
              <DialogDescription>
                Organizations group your agents, members, and API tokens.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="orgName" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Name
                </Label>
                <Input
                  id="orgName"
                  placeholder="Acme Corp"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgSlug" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Slug
                </Label>
                <div
                  className="flex items-center rounded-lg border overflow-hidden focus-within:ring-1 focus-within:ring-primary/50"
                  style={{ borderColor: "oklch(1 0 0 / 8%)" }}
                >
                  <span
                    className="px-3 py-2.5 text-xs text-white/50 font-mono shrink-0"
                    style={{ borderRight: "1px solid oklch(1 0 0 / 8%)", background: "oklch(1 0 0 / 3%)" }}
                  >
                    /org/
                  </span>
                  <Input
                    id="orgSlug"
                    placeholder="acme-corp"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    className="border-0 rounded-none focus-visible:ring-0 font-mono text-sm"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating || !form.name || !form.slug} className="btn-gradient text-white border-0 font-semibold">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Org cards grid */}
      {organizations.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 py-20 rounded-2xl"
          style={{ background: "oklch(1 0 0 / 2%)", border: "1px solid oklch(1 0 0 / 7%)" }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "oklch(1 0 0 / 4%)" }}
          >
            <Building2 className="h-7 w-7 text-white/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white/70">No organizations yet</p>
            <p className="text-xs text-white/50 mt-1">Create your first organization to get started.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {organizations.map((org) => {
            const isActive = org.id === selectedOrgId;
            const role = org.role ?? "member";
            const roleStyle = ROLE_STYLES[role] ?? ROLE_STYLES.member;

            return (
              <div
                key={org.id}
                className="group relative flex flex-col gap-4 rounded-2xl p-5 transition-all"
                style={{
                  background: isActive
                    ? "oklch(0.65 0.22 268 / 6%)"
                    : "oklch(1 0 0 / 3%)",
                  border: isActive
                    ? "1px solid oklch(0.65 0.22 268 / 30%)"
                    : "1px solid oklch(1 0 0 / 8%)",
                  boxShadow: isActive
                    ? "0 0 0 1px oklch(0.65 0.22 268 / 15%), inset 0 1px 0 oklch(1 0 0 / 4%)"
                    : "inset 0 1px 0 oklch(1 0 0 / 4%)",
                }}
              >
                {/* Active indicator */}
                {isActive && (
                  <div
                    className="absolute top-4 right-4 flex items-center gap-1"
                  >
                    <span className="status-dot status-dot-active" />
                    <span className="text-[10px] font-bold text-emerald-400">Active</span>
                  </div>
                )}

                {/* Org identity */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                    style={{
                      background: orgGradient(org.name),
                      boxShadow: "0 4px 12px oklch(0 0 0 / 30%)",
                    }}
                  >
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{org.name}</p>
                    <code className="text-xs text-white/50 font-mono">{org.slug}</code>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border"
                    style={{
                      background: roleStyle.bg,
                      color: roleStyle.text,
                      borderColor: roleStyle.border,
                    }}
                  >
                    {role}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {!isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-3 text-white/60 hover:text-white hover:bg-white/[0.06]"
                        onClick={() => setSelectedOrgId(org.id)}
                      >
                        Switch
                      </Button>
                    )}
                    {org.role === "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-white/40 hover:text-red-400 hover:bg-red-400/10"
                        onClick={() => setDeleteTarget(org)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the organization, all its members, API tokens, and agent data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
