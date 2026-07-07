"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Pause,
  Bot,
  Key,
  FlaskConical,
  Copy,
  Search,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface RunTrace {
  id: string;
  agentId: string;
  sessionId: string | null;
  threadId: string | null;
  runMode: "async" | "sync" | "stream";
  status: "queued" | "running" | "done" | "failed" | "hitl";
  input: any;
  output: any;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number | null;
  error: string | null;
  triggeredBy: "api_token" | "playground";
  createdAt: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────

const STATUS_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  done:    { icon: CheckCircle2, color: "text-emerald-400", bg: "oklch(0.72 0.18 145 / 15%)" },
  failed:  { icon: XCircle,      color: "text-red-400",     bg: "oklch(0.55 0.22 25 / 15%)"  },
  running: { icon: Loader2,      color: "text-blue-400",    bg: "oklch(0.60 0.18 235 / 15%)" },
  queued:  { icon: Clock,        color: "text-amber-400",   bg: "oklch(0.70 0.16 75 / 15%)"  },
  hitl:    { icon: Pause,        color: "text-purple-400",  bg: "oklch(0.60 0.20 295 / 15%)" },
};

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Row ─────────────────────────────────────────────────────────────────────

function TraceRow({ trace }: { trace: RunTrace }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[trace.status] ?? STATUS_META.done;
  const Icon = meta.icon;

  const copyJSON = (v: any) => {
    navigator.clipboard.writeText(JSON.stringify(v, null, 2));
    toast.success("Copied to clipboard");
  };

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: "oklch(1 0 0 / 3%)", border: "1px solid oklch(1 0 0 / 7%)" }}
    >
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Status */}
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: meta.bg }}
        >
          <Icon className={`h-3.5 w-3.5 ${meta.color} ${trace.status === "running" ? "animate-spin" : ""}`} />
        </span>

        {/* Agent */}
        <code className="text-xs font-mono font-semibold text-white/80 truncate max-w-[120px]">
          {trace.agentId}
        </code>

        {/* Mode badge */}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: "oklch(1 0 0 / 6%)", color: "oklch(0.75 0 0)" }}
        >
          {trace.runMode}
        </span>

        {/* Triggered by */}
        <span className="shrink-0 flex items-center gap-1 text-[10px] text-white/30">
          {trace.triggeredBy === "api_token"
            ? <Key className="h-3 w-3" />
            : <FlaskConical className="h-3 w-3" />}
          {trace.triggeredBy === "api_token" ? "API" : "Playground"}
        </span>

        {/* Duration */}
        <span className="ml-auto shrink-0 font-mono text-[11px] text-white/35">
          {formatDuration(trace.durationMs)}
        </span>

        {/* Tokens */}
        {(trace.tokensIn !== null || trace.tokensOut !== null) && (
          <span className="shrink-0 text-[10px] text-white/25 font-mono">
            ↑{trace.tokensIn ?? 0} ↓{trace.tokensOut ?? 0}
          </span>
        )}

        {/* Time */}
        <span className="shrink-0 text-[10px] text-white/25 hidden md:block">
          {formatTime(trace.createdAt)}
        </span>

        {/* Expand chevron */}
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-white/25 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-white/25 shrink-0" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-4 space-y-4">
          {/* Meta row */}
          <div className="flex flex-wrap gap-4 text-[11px] text-white/40 font-mono">
            <span>ID: <span className="text-white/60">{trace.id}</span></span>
            {trace.sessionId && (
              <span>Session: <span className="text-white/60">{trace.sessionId}</span></span>
            )}
            {trace.threadId && (
              <span>Thread: <span className="text-white/60">{trace.threadId}</span></span>
            )}
            <span>
              Status:{" "}
              <span className={meta.color + " font-semibold capitalize"}>{trace.status}</span>
            </span>
          </div>

          {/* Error */}
          {trace.error && (
            <div
              className="rounded-lg px-3 py-2 text-xs text-red-400 font-mono"
              style={{ background: "oklch(0.55 0.22 25 / 10%)" }}
            >
              {trace.error}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Input</p>
                <Button
                  variant="ghost" size="icon"
                  className="h-5 w-5 text-white/20 hover:text-white"
                  onClick={() => copyJSON(trace.input)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div
                className="max-h-48 overflow-auto rounded-lg p-3"
                style={{ background: "oklch(0.04 0.008 268)" }}
              >
                <pre className="text-[11px] font-mono text-emerald-400/70 whitespace-pre-wrap">
                  {JSON.stringify(trace.input, null, 2)}
                </pre>
              </div>
            </div>

            {/* Output */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Output</p>
                {trace.output && (
                  <Button
                    variant="ghost" size="icon"
                    className="h-5 w-5 text-white/20 hover:text-white"
                    onClick={() => copyJSON(trace.output)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div
                className="max-h-48 overflow-auto rounded-lg p-3"
                style={{ background: "oklch(0.04 0.008 268)" }}
              >
                <pre className="text-[11px] font-mono text-blue-400/70 whitespace-pre-wrap">
                  {trace.output
                    ? JSON.stringify(trace.output, null, 2)
                    : "// no output yet"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TracesPage() {
  const { selectedOrgId } = useAppStore();

  const [traces, setTraces] = useState<RunTrace[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  // Input fields
  const [agentInput, setAgentInput] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [threadInput, setThreadInput] = useState("");

  // Active filters
  const [agentFilter, setAgentFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [threadFilter, setThreadFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchTraces = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(offset),
      });
      if (agentFilter.trim()) params.set("agentId", agentFilter.trim());
      if (sessionFilter.trim()) params.set("sessionId", sessionFilter.trim());
      if (threadFilter.trim()) params.set("threadId", threadFilter.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await api.get(
        `/organizations/${selectedOrgId}/traces?${params}`,
      );
      setTraces(res?.data?.runs ?? []);
      setTotal(res?.data?.total ?? 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to load traces");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, offset, agentFilter, sessionFilter, threadFilter, statusFilter]);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  // Apply filters
  const applyFilters = () => {
    setAgentFilter(agentInput);
    setSessionFilter(sessionInput);
    setThreadFilter(threadInput);
    setOffset(0);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Traces</h1>
            {!loading && (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold"
                style={{
                  background: "oklch(0.65 0.22 268 / 15%)",
                  color: "oklch(0.80 0.18 268)",
                  border: "1px solid oklch(0.65 0.22 268 / 25%)",
                }}
              >
                {total}
              </span>
            )}
          </div>
          <p className="text-sm text-white/45 mt-1">
            Every agent run — from API token and playground — logged in real-time.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchTraces}
          className="gap-2 text-white/40 hover:text-white h-9"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap gap-3 rounded-xl px-4 py-3"
        style={{ background: "oklch(1 0 0 / 3%)", border: "1px solid oklch(1 0 0 / 7%)" }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 text-white/30 shrink-0" />
          <Input
            placeholder="Filter by agent ID…"
            value={agentInput}
            onChange={(e) => setAgentInput(e.target.value)}
            className="h-8 text-xs bg-transparent border-0 p-0 focus-visible:ring-0 placeholder:text-white/25"
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 text-white/30 shrink-0" />
          <Input
            placeholder="Filter by session ID…"
            value={sessionInput}
            onChange={(e) => setSessionInput(e.target.value)}
            className="h-8 text-xs bg-transparent border-0 p-0 focus-visible:ring-0 placeholder:text-white/25"
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 text-white/30 shrink-0" />
          <Input
            placeholder="Filter by thread ID…"
            value={threadInput}
            onChange={(e) => setThreadInput(e.target.value)}
            className="h-8 text-xs bg-transparent border-0 p-0 focus-visible:ring-0 placeholder:text-white/25"
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { if (v) { setStatusFilter(v); setOffset(0); } }}>
          <SelectTrigger className="h-8 w-36 text-xs bg-white/[0.04] border-white/[0.08]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All statuses</SelectItem>
            <SelectItem value="done" className="text-xs">Done</SelectItem>
            <SelectItem value="failed" className="text-xs">Failed</SelectItem>
            <SelectItem value="running" className="text-xs">Running</SelectItem>
            <SelectItem value="queued" className="text-xs">Queued</SelectItem>
            <SelectItem value="hitl" className="text-xs">HITL</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs px-3 text-white/40 hover:text-white"
          onClick={applyFilters}
        >
          Apply
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-white/30 font-mono flex-wrap">
        <span className="flex items-center gap-1.5"><Key className="h-3 w-3" />API token</span>
        <span className="flex items-center gap-1.5"><FlaskConical className="h-3 w-3" />Playground</span>
        <span className="ml-auto">↑ tokens in  ↓ tokens out</span>
      </div>

      {/* Trace list */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))
        ) : traces.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 py-20 rounded-2xl"
            style={{ background: "oklch(1 0 0 / 2%)", border: "1px solid oklch(1 0 0 / 7%)" }}
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: "oklch(1 0 0 / 4%)" }}
            >
              <Activity className="h-6 w-6 text-white/20" />
            </div>
            <p className="text-sm text-white/40">No traces yet</p>
            <p className="text-xs text-white/25">Run an agent to see traces here.</p>
          </div>
        ) : (
          traces.map((trace) => <TraceRow key={trace.id} trace={trace} />)
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-xs text-white/35">
          <span>
            Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={offset === 0}
              onClick={() => setOffset((p) => Math.max(0, p - LIMIT))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset((p) => p + LIMIT)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
