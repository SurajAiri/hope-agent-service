"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Trash2, Settings, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { organizations, selectedOrgId, fetchOrganizations } = useAppStore();
  const router = useRouter();

  const activeOrg = organizations.find((o) => o.id === selectedOrgId);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteSlugConfirm, setDeleteSlugConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Show to owner or admin
  const canSeeSettings =
    activeOrg?.role === "owner" ||
    activeOrg?.role === "admin" ||
    activeOrg?.role === "member"; // members can now see it to leave
  const isOwner = activeOrg?.role === "owner";

  if (!activeOrg) {
    return (
      <div className="p-12 text-center text-muted-foreground border rounded-xl border-dashed border-card-border">
        No organization selected. Please select an organization to view
        settings.
      </div>
    );
  }

  if (!canSeeSettings) {
    return (
      <div className="p-12 text-center text-muted-foreground border rounded-xl border-dashed border-card-border">
        You do not have permission to view this organization's settings.
      </div>
    );
  }

  const handleDelete = async () => {
    if (!activeOrg || deleteSlugConfirm !== activeOrg.slug) return;

    setIsDeleting(true);
    try {
      await api.delete(`/organizations/${activeOrg.id}`);
      toast.success("Organization deleted successfully");
      setIsDeleteModalOpen(false);
      setDeleteSlugConfirm("");

      // Select another org if available, or null
      await fetchOrganizations();
      router.push("/dashboard/organizations");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete organization");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLeave = async () => {
    if (!activeOrg) return;

    setIsLeaving(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/members/leave`, {});
      toast.success("Left organization successfully");
      setIsLeaveModalOpen(false);

      // Select another org if available, or null
      await fetchOrganizations();
      router.push("/dashboard/organizations");
    } catch (err: any) {
      toast.error(err.message || "Failed to leave organization");
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Organization Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage settings and danger zones for {activeOrg.name}.
          </p>
        </div>
      </div>

      <Card glass className="relative overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>General Information</CardTitle>
              <CardDescription>
                Basic details about your organization
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted-foreground">
                Organization Name
              </span>
              <p className="font-medium">{activeOrg.name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted-foreground">
                Organization Slug
              </span>
              <p className="font-mono text-sm bg-white/5 p-1 rounded inline-block">
                {activeOrg.slug}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted-foreground">
                Your Role
              </span>
              <p className="font-medium capitalize">{activeOrg.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isOwner ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-12"
        >
          <Card className="border-red-500/50 bg-red-950/30 overflow-hidden">
            <CardHeader className="border-b border-red-500/20 bg-red-900/40 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <CardTitle className="text-red-400">Danger Zone</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="max-w-xl">
                  <h3 className="font-medium text-red-200">
                    Delete Organization
                  </h3>
                  <p className="text-red-200/70 text-sm mt-1">
                    Once you delete an organization, there is no going back.
                    Please be certain. All agents, API keys, and members will be
                    permanently removed.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  Delete {activeOrg.name}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-12"
        >
          <Card className="border-red-500/50 bg-red-950/30 overflow-hidden">
            <CardHeader className="border-b border-red-500/20 bg-red-900/40 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <CardTitle className="text-red-400">Danger Zone</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="max-w-xl">
                  <h3 className="font-medium text-red-200">
                    Leave Organization
                  </h3>
                  <p className="text-red-200/70 text-sm mt-1">
                    You will immediately lose access to all agents and resources
                    in this organization.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setIsLeaveModalOpen(true)}
                >
                  Leave {activeOrg.name}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteSlugConfirm("");
        }}
        onConfirm={handleDelete}
        title="Delete Organization"
        description="This action cannot be undone. This will permanently delete the organization and all associated data."
        confirmText="Delete Organization"
        isDestructive
        isLoading={isDeleting}
      >
        <div className="space-y-4 mt-4">
          <p className="text-sm">
            Please type{" "}
            <strong className="font-mono text-destructive">
              {activeOrg?.slug}
            </strong>{" "}
            to confirm.
          </p>
          <Input
            value={deleteSlugConfirm}
            onChange={(e) => setDeleteSlugConfirm(e.target.value)}
            placeholder={activeOrg?.slug}
            className="border-destructive/50 focus-visible:ring-destructive"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={handleLeave}
        title="Leave Organization"
        description={`Are you sure you want to leave ${activeOrg?.name}? You will lose all access immediately.`}
        confirmText="Leave Organization"
        isDestructive
        isLoading={isLeaving}
      />
    </div>
  );
}
