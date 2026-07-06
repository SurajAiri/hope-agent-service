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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Building2, Loader2, Check } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

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

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setForm({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the organizations you belong to.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New organization
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
              <DialogDescription>
                Organizations group your agents, members, and API tokens.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="orgName">Name</Label>
                <Input
                  id="orgName"
                  placeholder="Acme Corp"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgSlug">Slug</Label>
                <div className="flex items-center rounded-md border border-border overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <span className="px-3 py-2 text-xs text-muted-foreground bg-secondary border-r border-border">
                    /org/
                  </span>
                  <Input
                    id="orgSlug"
                    placeholder="acme-corp"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    className="border-0 rounded-none focus-visible:ring-0"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating || !form.name || !form.slug}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Slug</TableHead>
              <TableHead className="text-xs">Your role</TableHead>
              <TableHead className="w-20 text-xs">Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Building2 className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No organizations yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((org) => (
                <TableRow
                  key={org.id}
                  className={org.id === selectedOrgId ? "bg-primary/5" : ""}
                >
                  <TableCell className="font-medium text-sm">{org.name}</TableCell>
                  <TableCell>
                    <code className="text-xs font-mono text-muted-foreground">
                      {org.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {org.role ?? "member"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {org.id === selectedOrgId && (
                      <div className="flex items-center gap-1 text-xs text-primary">
                        <Check className="h-3.5 w-3.5" />
                        Active
                      </div>
                    )}
                    {org.id !== selectedOrgId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 text-muted-foreground"
                        onClick={() => setSelectedOrgId(org.id)}
                      >
                        Switch
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {org.role === "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(org)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
