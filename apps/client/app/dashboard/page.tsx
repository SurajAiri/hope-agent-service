"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KeyRound,
  Users,
  Bot,
  ArrowRight,
  Check,
  X,
  MailCheck,
  Loader2,
  Zap,
  Code2,
} from "lucide-react";

interface Invitation {
  membership: { id: string; role: string };
  organization: { id: string; name: string };
}

interface QuickStat {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  gradient: string;
  glow: string;
}

const stats: QuickStat[] = [
  {
    label: "API Tokens",
    href: "/dashboard/tokens",
    icon: KeyRound,
    description: "Manage your org API keys",
    gradient: "from-violet-600 to-indigo-600",
    glow: "oklch(0.55 0.22 280 / 30%)",
  },
  {
    label: "Team Members",
    href: "/dashboard/members",
    icon: Users,
    description: "Invite and manage your team",
    gradient: "from-indigo-600 to-blue-600",
    glow: "oklch(0.55 0.18 255 / 30%)",
  },
  {
    label: "Agents",
    href: "/dashboard/agents",
    icon: Bot,
    description: "Browse and test agents",
    gradient: "from-cyan-600 to-emerald-600",
    glow: "oklch(0.55 0.16 185 / 30%)",
  },
];

const GETTING_STARTED = [
  {
    step: "01",
    title: "Create an API token",
    desc: "Generate a token from API Tokens — use it to authenticate your requests.",
    href: "/dashboard/tokens",
    Icon: KeyRound,
  },
  {
    step: "02",
    title: "Browse available agents",
    desc: "Check the Agents page to see registered agents and their IDs.",
    href: "/dashboard/agents",
    Icon: Bot,
  },
  {
    step: "03",
    title: "Fire your first run",
    desc: "POST /organizations/{orgId}/agents/run/sync with your agent_id and messages.",
    href: "/dashboard/agents",
    mono: true,
    Icon: Zap,
  },
];

export default function DashboardPage() {
  const { organizations, selectedOrgId, user, fetchOrganizations } = useAppStore();
  const org = organizations.find((o) => o.id === selectedOrgId);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/users/me/invitations");
        setInvitations(Array.isArray(res) ? res : res.data ?? []);
      } catch {
        // silently ignore
      } finally {
        setLoadingInvites(false);
      }
    };
    load();
  }, []);

  const handleAccept = async (orgId: string) => {
    setRespondingId(orgId);
    try {
      await api.post(`/organizations/${orgId}/members/accept`, {});
      toast.success("Invitation accepted");
      setInvitations((prev) => prev.filter((i) => i.organization.id !== orgId));
      await fetchOrganizations();
    } catch (err: any) {
      toast.error(err.message || "Failed to accept");
    } finally {
      setRespondingId(null);
    }
  };

  const handleReject = async (orgId: string) => {
    setRespondingId(orgId);
    try {
      await api.post(`/organizations/${orgId}/members/reject`, {});
      toast.success("Invitation declined");
      setInvitations((prev) => prev.filter((i) => i.organization.id !== orgId));
    } catch (err: any) {
      toast.error(err.message || "Failed to decline");
    } finally {
      setRespondingId(null);
    }
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back,{" "}
            <span className="gradient-text">{firstName}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-sm text-white/45">
            {org ? (
              <>
                <span className="text-white/70 font-medium">{org.name}</span>
                {" workspace"}
              </>
            ) : (
              "Select an organization to get started"
            )}
          </p>
          {org && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border"
              style={{
                background: "oklch(0.65 0.22 268 / 15%)",
                borderColor: "oklch(0.65 0.22 268 / 30%)",
                color: "oklch(0.80 0.18 268)",
              }}
            >
              {org.role}
            </span>
          )}
        </div>
      </div>

      {/* Pending invitations */}
      {!loadingInvites && invitations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MailCheck className="h-4 w-4 text-amber-400" />
            <span>Pending invitations</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-400">
              {invitations.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {invitations.map((invite) => (
              <div
                key={invite.membership.id}
                className="flex items-center justify-between rounded-xl px-4 py-3.5"
                style={{
                  background: "oklch(0.70 0.16 75 / 8%)",
                  border: "1px solid oklch(0.70 0.16 75 / 20%)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-amber-400"
                    style={{ background: "oklch(0.70 0.16 75 / 15%)" }}
                  >
                    {invite.organization.name.charAt(0)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{invite.organization.name}</p>
                    <p className="text-xs text-white/40 capitalize">
                      Invited as {invite.membership.role}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-white/40 hover:text-red-400 hover:bg-red-400/10"
                    disabled={respondingId === invite.organization.id}
                    onClick={() => handleReject(invite.organization.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs font-semibold"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.72 0.16 75), oklch(0.75 0.14 60))",
                      color: "oklch(0.15 0.05 75)",
                    }}
                    disabled={respondingId === invite.organization.id}
                    onClick={() => handleAccept(invite.organization.id)}
                  >
                    {respondingId === invite.organization.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-3 w-3" />
                        Accept
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href} className="group block">
            <div
              className="relative h-full rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: "oklch(1 0 0 / 3%)",
                border: "1px solid oklch(1 0 0 / 8%)",
                boxShadow: "0 1px 3px oklch(0 0 0 / 30%)",
              }}
            >
              {/* Icon */}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} mb-4`}
                style={{ boxShadow: `0 4px 12px ${stat.glow}` }}
              >
                <stat.icon className="h-5 w-5 text-white" />
              </div>

              <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-1">
                {stat.label}
              </p>
              <p className="text-sm text-white/60">{stat.description}</p>

              <div className="flex items-center gap-1 mt-4 text-xs font-semibold text-primary">
                <span>View</span>
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>

              {/* Hover glow */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at 20% 20%, ${stat.glow}, transparent 60%)`,
                }}
              />
            </div>
          </Link>
        ))}
      </div>

      {/* Getting started */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "oklch(1 0 0 / 3%)",
          border: "1px solid oklch(1 0 0 / 8%)",
          boxShadow: "0 1px 3px oklch(0 0 0 / 30%)",
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: "linear-gradient(135deg, oklch(0.60 0.22 268), oklch(0.65 0.20 290))",
                boxShadow: "0 2px 8px oklch(0.60 0.22 268 / 35%)",
              }}
            >
              <Code2 className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Getting started</h2>
              <p className="text-xs text-white/40 mt-0.5">Follow these steps to integrate AgentOS into your project.</p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="divide-y divide-white/[0.04]">
          {GETTING_STARTED.map((item, idx) => (
            <Link
              key={item.step}
              href={item.href}
              className="group flex items-start gap-4 px-6 py-4 transition-colors hover:bg-white/[0.03]"
            >
              {/* Step number */}
              <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    background: "oklch(0.65 0.22 268 / 15%)",
                    color: "oklch(0.80 0.18 268)",
                    border: "1px solid oklch(0.65 0.22 268 / 25%)",
                  }}
                >
                  {idx + 1}
                </span>
                {idx < GETTING_STARTED.length - 1 && (
                  <div className="w-px flex-1 min-h-[20px] bg-white/[0.06]" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2">
                  <item.Icon className="h-3.5 w-3.5 text-white/30" />
                  <p className="text-sm font-semibold">{item.title}</p>
                </div>
                <p className={`text-xs text-white/40 mt-1 ${item.mono ? "font-mono" : ""}`}>
                  {item.desc}
                </p>
              </div>

              <ArrowRight className="h-4 w-4 text-white/20 shrink-0 mt-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
