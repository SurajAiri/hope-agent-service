"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Copy, Plus, Trash2, KeyRound, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const copyKey = (value: string, id?: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">API Tokens</h1>
            {!loading && keys.length > 0 && (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold"
                style={{
                  background: "oklch(0.65 0.22 268 / 15%)",
                  color: "oklch(0.80 0.18 268)",
                  border: "1px solid oklch(0.65 0.22 268 / 25%)",
                }}
              >
                {keys.length}
              </span>
            )}
          </div>
          <p className="text-sm text-white/60 mt-1">
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
          <DialogTrigger
            render={
              <Button size="sm" className="gap-2 btn-gradient text-white border-0 font-semibold h-9">
                <Plus className="h-4 w-4" />
                New token
              </Button>
            }
          />
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
                  <Label htmlFor="keyName" className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Token name
                  </Label>
                  <Input
                    id="keyName"
                    placeholder="e.g. Production backend"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating || !newKeyName.trim()} className="btn-gradient text-white border-0 font-semibold">
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create token
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-4 py-2">
                <Alert
                  style={{
                    background: "oklch(0.70 0.16 75 / 8%)",
                    border: "1px solid oklch(0.70 0.16 75 / 25%)",
                  }}
                >
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  <AlertDescription className="text-xs text-amber-300/90">
                    <strong>Copy this key now.</strong> You won&apos;t be able to see it again.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Your new API token
                  </Label>
                  {/* Terminal-style key block */}
                  <div
                    className="rounded-xl border overflow-hidden"
                    style={{
                      background: "oklch(0.06 0.01 268)",
                      borderColor: "oklch(1 0 0 / 8%)",
                    }}
                  >
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06]">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                      </div>
                      <span className="text-[10px] text-white/40 font-mono">API KEY</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-3">
                      <code className="flex-1 font-mono text-xs text-emerald-400/90 break-all select-all">
                        {showKey ? newKeyValue : "ak_" + "•".repeat(44)}
                      </code>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/[0.06]"
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-white/50 hover:text-emerald-400 hover:bg-emerald-400/10"
                          onClick={() => copyKey(newKeyValue!)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => { setCreateOpen(false); setNewKeyValue(null); }}
                    className="btn-gradient text-white border-0 font-semibold"
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Tokens list */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "oklch(1 0 0 / 3%)",
          border: "1px solid oklch(1 0 0 / 8%)",
        }}
      >
        {/* Table header */}
        <div
          className="grid items-center gap-4 px-5 py-3 border-b border-white/[0.05]"
          style={{
            gridTemplateColumns: "minmax(140px,1.5fr) 120px 80px 110px 110px 44px",
            background: "oklch(1 0 0 / 2%)",
          }}
        >
          {["Name", "Prefix", "Status", "Created", "Expires", ""].map((h, i) => (
            <span key={i} className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              {h}
            </span>
          ))}
        </div>

        <div className="divide-y divide-white/[0.04]">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-5 w-24 rounded-lg" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-white/50">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "oklch(1 0 0 / 4%)" }}
              >
                <KeyRound className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white/70">No API tokens yet</p>
                <p className="text-xs mt-0.5">Create your first token to start using the API.</p>
              </div>
            </div>
          ) : (
            keys.map((key) => {
              const isActive = key.status === "active";
              return (
                <div
                  key={key.id}
                  className="grid items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
                  style={{ gridTemplateColumns: "minmax(140px,1.5fr) 120px 80px 110px 110px 44px" }}
                >
                  {/* Name */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: "oklch(0.65 0.22 268 / 12%)",
                        border: "1px solid oklch(0.65 0.22 268 / 20%)",
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-semibold truncate">{key.name}</span>
                  </div>

                  {/* Prefix */}
                  <div
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 w-fit"
                    style={{
                      background: "oklch(0.06 0.01 268)",
                      border: "1px solid oklch(1 0 0 / 8%)",
                    }}
                  >
                    <code className="text-xs font-mono text-emerald-400/80">{key.prefix}…</code>
                    <button
                      onClick={() => copyKey(key.prefix, key.id)}
                      className="ml-0.5 text-white/40 hover:text-emerald-400 transition-colors"
                    >
                      <Copy className={`h-3 w-3 transition-colors ${copiedId === key.id ? "text-emerald-400" : ""}`} />
                    </button>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <span className={`status-dot ${isActive ? "status-dot-active" : "status-dot-revoked"}`} />
                    <span className={`text-xs font-medium capitalize ${isActive ? "text-emerald-400" : "text-white/50"}`}>
                      {key.status}
                    </span>
                  </div>

                  {/* Created */}
                  <span className="text-xs text-white/60">{formatDate(key.createdAt)}</span>

                  {/* Expires */}
                  <span className="text-xs text-white/60">
                    {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                  </span>

                  {/* Revoke */}
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white/40 hover:text-red-400 hover:bg-red-400/10"
                      onClick={() => setRevokeTarget(key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
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
