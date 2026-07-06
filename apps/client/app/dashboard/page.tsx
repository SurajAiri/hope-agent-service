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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  KeyRound,
  Users,
  Bot,
  ArrowRight,
  Check,
  X,
  MailCheck,
} from "lucide-react";

interface Invitation {
  membership: { id: string; role: string };
  organization: { id: string; name: string };
}

interface QuickStat {
  label: string;
  value: string | number;
  href: string;
  icon: React.ElementType;
  description: string;
}

export default function DashboardPage() {
  const { organizations, selectedOrgId, fetchOrganizations } = useAppStore();
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

  const stats: QuickStat[] = [
    {
      label: "API Tokens",
      value: "—",
      href: "/dashboard/tokens",
      icon: KeyRound,
      description: "Manage your org API keys",
    },
    {
      label: "Team Members",
      value: org ? "—" : "—",
      href: "/dashboard/members",
      icon: Users,
      description: "Invite and manage your team",
    },
    {
      label: "Agents",
      value: "—",
      href: "/dashboard/agents",
      icon: Bot,
      description: "Browse and test agents",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {org ? (
            <>
              <span className="text-foreground font-medium">{org.name}</span>{" "}
              workspace
              <Badge variant="outline" className="ml-2 text-[10px] h-4 font-mono">
                {org.role}
              </Badge>
            </>
          ) : (
            "Select an organization to get started"
          )}
        </p>
      </div>

      {/* Pending invitations */}
      {!loadingInvites && invitations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MailCheck className="h-4 w-4 text-amber-400" />
            <span>Pending invitations</span>
            <Badge variant="secondary" className="text-[10px]">
              {invitations.length}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {invitations.map((invite) => (
              <div
                key={invite.membership.id}
                className="flex items-center justify-between rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{invite.organization.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    As {invite.membership.role}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    disabled={respondingId === invite.organization.id}
                    onClick={() => handleReject(invite.organization.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-amber-400 hover:bg-amber-400/90 text-amber-900 font-medium"
                    disabled={respondingId === invite.organization.id}
                    onClick={() => handleAccept(invite.organization.id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
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
            <Card className="h-full transition-colors hover:border-border/80 hover:bg-card/80">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider">
                    {stat.label}
                  </CardDescription>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{stat.description}</p>
                <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                  <span>View</span>
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Getting started */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting started</CardTitle>
          <CardDescription>
            Follow these steps to integrate AgentOS into your project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {[
            {
              step: "1",
              title: "Create an API token",
              desc: "Generate a token from API Tokens — use it to authenticate your requests.",
              href: "/dashboard/tokens",
            },
            {
              step: "2",
              title: "Browse available agents",
              desc: "Check the Agents page to see registered agents and their IDs.",
              href: "/dashboard/agents",
            },
            {
              step: "3",
              title: "Fire your first run",
              desc: "POST to /organizations/{orgId}/agents/run with your agent_id and messages.",
              href: "/dashboard/agents",
              mono: true,
            },
          ].map((item) => (
            <Link
              key={item.step}
              href={item.href}
              className="group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-secondary/60"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground mt-0.5">
                {item.step}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className={`text-xs text-muted-foreground mt-0.5 ${item.mono ? "font-mono" : ""}`}>
                  {item.desc}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
