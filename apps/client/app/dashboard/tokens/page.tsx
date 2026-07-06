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
import { Copy, Plus, Trash2, KeyRound, Eye, EyeOff, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

export default function TokensPage() {
  const { selectedOrgId } = useAppStore();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const res = await api.get(`/organizations/${selectedOrgId}/apikeys`);
      setKeys(Array.isArray(res) ? res : res.data ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post(`/organizations/${selectedOrgId}/apikeys`, {
        name: newKeyName.trim(),
      });
      const data = res.data ?? res;
      setNewKeyValue(data.key);
      setNewKeyName("");
      await fetchKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget || !selectedOrgId) return;
    setRevoking(true);
    try {
      await api.delete(`/organizations/${selectedOrgId}/apikeys/${revokeTarget.id}`);
      toast.success(`"${revokeTarget.name}" revoked`);
      setRevokeTarget(null);
      await fetchKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke key");
    } finally {
      setRevoking(false);
    }
  };

  const copyKey = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Tokens</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage API keys for programmatic access to agents.
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) { setNewKeyValue(null); setShowKey(false); }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New token
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create API token</DialogTitle>
              <DialogDescription>
                Give your token a descriptive name. The full key is shown once.
              </DialogDescription>
            </DialogHeader>

            {!newKeyValue ? (
              <form onSubmit={handleCreate} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="keyName">Token name</Label>
                  <Input
                    id="keyName"
                    placeholder="e.g. Production backend"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating || !newKeyName.trim()}>
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create token
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-4 py-2">
                <Alert className="border-amber-400/30 bg-amber-400/5">
                  <AlertDescription className="text-xs text-amber-300">
                    Copy this key now. You won&apos;t be able to see it again.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label>Your new API token</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 font-mono text-xs rounded-md border border-border bg-secondary px-3 py-2 overflow-hidden">
                      {showKey ? newKeyValue : "ak_" + "•".repeat(40)}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)}>
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyKey(newKeyValue!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => { setCreateOpen(false); setNewKeyValue(null); }}>
                    Done
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Prefix</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Created</TableHead>
              <TableHead className="text-xs">Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <KeyRound className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No API tokens yet</p>
                    <p className="text-xs">Create your first token to start using the API.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium text-sm">{key.name}</TableCell>
                  <TableCell>
                    <code className="text-xs font-mono text-muted-foreground">
                      {key.prefix}…
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={key.status === "active" ? "default" : "secondary"}
                      className="text-[10px] capitalize"
                    >
                      {key.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(key.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setRevokeTarget(key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &ldquo;{revokeTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This key will be permanently revoked. Any services using it will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-destructive hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="h-4 w-4 animate-spin" />}
              Revoke token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
