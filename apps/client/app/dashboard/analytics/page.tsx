"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart2,
  RefreshCw,
  TrendingUp,
  Clock,
  CheckCircle2,
  Cpu,
  Bot,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface OverviewData {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

interface TimePoint {
  date: string;
  count?: number;
  tokensIn?: number;
  tokensOut?: number;
}

interface StatusDist {
  status: string;
  count: number;
}

interface TopAgent {
  agentId: string;
  count: number;
  avgDurationMs: number;
}

interface ModeDist {
  runMode: string;
  count: number;
}

interface AnalyticsData {
  overview: OverviewData;
  runsOverTime: TimePoint[];
  statusDist: StatusDist[];
  topAgents: TopAgent[];
  tokenUsage: TimePoint[];
  modeDist: ModeDist[];
}

// ── Config ─────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const STATUS_COLORS: Record<string, string> = {
  done: "oklch(0.72 0.18 145)",
  failed: "oklch(0.55 0.22 25)",
  running: "oklch(0.60 0.18 235)",
  queued: "oklch(0.70 0.16 75)",
  hitl: "oklch(0.60 0.20 295)",
};

const MODE_COLORS: Record<string, string> = {
  sync: "oklch(0.65 0.22 268)",
  async: "oklch(0.60 0.18 235)",
  stream: "oklch(0.72 0.18 145)",
};

const CHART_TOOLTIP_STYLE = {
  background: "oklch(0.14 0 0)",
  border: "1px solid oklch(1 0 0 / 10%)",
  borderRadius: "8px",
  fontSize: "11px",
  color: "oklch(0.85 0 0)",
};

// ── Subcomponents ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
  glow,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  gradient: string;
  glow: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "oklch(1 0 0 / 3%)",
        border: "1px solid oklch(1 0 0 / 8%)",
      }}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} mb-4`}
        style={{ boxShadow: `0 4px 12px ${glow}` }}
      >
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50 mt-1">
        {label}
      </p>
      {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "oklch(1 0 0 / 3%)",
        border: "1px solid oklch(1 0 0 / 8%)",
      }}
    >
      <div className="px-5 py-4 border-b border-white/[0.05]">
        <p className="text-sm font-bold">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { selectedOrgId } = useAppStore();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const fetchAnalytics = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - period * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await api.get(
        `/organizations/${selectedOrgId}/analytics?${params}`,
      );
      setData(res?.data ?? res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, period]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const ov = data?.overview;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-white/60 mt-1">
            Usage stats, token trends, and agent performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period picker */}
          <div
            className="flex items-center gap-0.5 rounded-lg p-0.5"
            style={{ background: "oklch(1 0 0 / 5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
          >
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriod(p.days)}
                className="rounded-md px-3 py-1.5 text-xs font-semibold transition-all"
                style={
                  period === p.days
                    ? {
                        background: "oklch(0.65 0.22 268 / 20%)",
                        color: "oklch(0.80 0.18 268)",
                      }
                    : { color: "oklch(0.55 0 0)" }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAnalytics}
            className="gap-2 text-white/60 hover:text-white h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              icon={TrendingUp}
              label="Total Runs"
              value={ov?.totalRuns.toLocaleString() ?? "—"}
              gradient="from-violet-600 to-indigo-600"
              glow="oklch(0.55 0.22 280 / 30%)"
            />
            <StatCard
              icon={CheckCircle2}
              label="Success Rate"
              value={ov ? `${ov.successRate}%` : "—"}
              gradient="from-emerald-600 to-teal-600"
              glow="oklch(0.55 0.18 165 / 30%)"
            />
            <StatCard
              icon={Clock}
              label="Avg Latency"
              value={
                ov
                  ? ov.avgDurationMs < 1000
                    ? `${ov.avgDurationMs}ms`
                    : `${(ov.avgDurationMs / 1000).toFixed(1)}s`
                  : "—"
              }
              gradient="from-blue-600 to-cyan-600"
              glow="oklch(0.55 0.18 235 / 30%)"
            />
            <StatCard
              icon={Cpu}
              label="Tokens In"
              value={ov?.totalTokensIn.toLocaleString() ?? "—"}
              sub="input tokens"
              gradient="from-amber-600 to-orange-600"
              glow="oklch(0.62 0.18 55 / 30%)"
            />
            <StatCard
              icon={Cpu}
              label="Tokens Out"
              value={ov?.totalTokensOut.toLocaleString() ?? "—"}
              sub="output tokens"
              gradient="from-rose-600 to-pink-600"
              glow="oklch(0.55 0.22 10 / 30%)"
            />
          </>
        )}
      </div>

      {/* Charts row 1: Runs over time + Status distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Runs over time">
            {loading ? (
              <Skeleton className="h-52 w-full rounded-lg" />
            ) : (data?.runsOverTime?.length ?? 0) === 0 ? (
              <div className="flex h-52 items-center justify-center text-xs text-white/40">
                No data for this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data!.runsOverTime} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="runGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.65 0.22 268)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.65 0.22 268)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="count" stroke="oklch(0.65 0.22 268)" strokeWidth={2} fill="url(#runGrad)" name="Runs" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Status breakdown">
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : (data?.statusDist?.length ?? 0) === 0 ? (
            <div className="flex h-52 items-center justify-center text-xs text-white/40">
              No data
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={data!.statusDist}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    strokeWidth={0}
                  >
                    {data!.statusDist.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={STATUS_COLORS[entry.status] ?? "oklch(0.50 0 0)"}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {data!.statusDist.map((d) => (
                  <span key={d.status} className="flex items-center gap-1.5 text-[11px] text-white/70">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: STATUS_COLORS[d.status] ?? "oklch(0.50 0 0)" }}
                    />
                    {d.status}: <strong className="text-white/70">{d.count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Charts row 2: Token usage + Run mode + Top agents */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Token usage over time */}
        <div className="lg:col-span-2">
          <SectionCard title="Token usage over time">
            {loading ? (
              <Skeleton className="h-52 w-full rounded-lg" />
            ) : (data?.tokenUsage?.length ?? 0) === 0 ? (
              <div className="flex h-52 items-center justify-center text-xs text-white/40">
                No token data — available when agents report usage
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data!.tokenUsage} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.70 0.16 75)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.70 0.16 75)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.60 0.20 295)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.60 0.20 295)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "oklch(0.55 0 0)" }} />
                  <Area type="monotone" dataKey="tokensIn" stroke="oklch(0.70 0.16 75)" strokeWidth={2} fill="url(#inGrad)" name="Tokens In" />
                  <Area type="monotone" dataKey="tokensOut" stroke="oklch(0.60 0.20 295)" strokeWidth={2} fill="url(#outGrad)" name="Tokens Out" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* Run mode distribution */}
        <SectionCard title="Run mode split">
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : (data?.modeDist?.length ?? 0) === 0 ? (
            <div className="flex h-52 items-center justify-center text-xs text-white/40">No data</div>
          ) : (
            <div className="space-y-3 pt-2">
              {data!.modeDist.map((d) => {
                const total = data!.modeDist.reduce((s, x) => s + x.count, 0);
                const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                return (
                  <div key={d.runMode} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-mono text-white/60 capitalize">{d.runMode}</span>
                      <span className="text-white/50">{d.count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 6%)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: MODE_COLORS[d.runMode] ?? "oklch(0.55 0 0)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Top agents leaderboard */}
      <SectionCard title="Top agents">
        {loading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : (data?.topAgents?.length ?? 0) === 0 ? (
          <div className="flex h-24 items-center justify-center text-xs text-white/40">No data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/50 uppercase tracking-widest text-[10px]">
                  <th className="pb-3 text-left font-semibold">#</th>
                  <th className="pb-3 text-left font-semibold">Agent ID</th>
                  <th className="pb-3 text-right font-semibold">Calls</th>
                  <th className="pb-3 text-right font-semibold">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data!.topAgents.map((agent, i) => (
                  <tr key={agent.agentId} className="group">
                    <td className="py-2.5 text-white/40 font-mono">{i + 1}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                          style={{ background: "oklch(0.65 0.22 268 / 15%)" }}
                        >
                          <Bot className="h-3 w-3 text-primary" />
                        </div>
                        <code className="font-mono text-white/80">{agent.agentId}</code>
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-white/60">
                      {agent.count.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right font-mono text-white/60">
                      {agent.avgDurationMs < 1000
                        ? `${agent.avgDurationMs}ms`
                        : `${(agent.avgDurationMs / 1000).toFixed(1)}s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
