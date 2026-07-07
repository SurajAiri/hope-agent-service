"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Bot,
  Play,
  Loader2,
  RefreshCw,
  AlertCircle,
  Copy,
  Clock,
  CheckCircle2,
  XCircle,
  Terminal,
  Zap,
  FlaskConical,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3030/api/v1";

interface Agent {
  id: string;
  description?: string;
}

interface RunResult {
  session_id: string;
  status: string;
  result?: any;
  error?: string;
  duration_ms?: number;
}

const STATUS_META: Record<string, { icon: React.ElementType; color: string; glow: string }> = {
  done:  { icon: CheckCircle2, color: "text-emerald-400", glow: "oklch(0.72 0.18 145 / 20%)" },
  fail:  { icon: XCircle,      color: "text-red-400",     glow: "oklch(0.55 0.22 25 / 20%)"  },
  wip:   { icon: Loader2,      color: "text-blue-400",    glow: "oklch(0.60 0.18 235 / 20%)" },
  queue: { icon: Clock,        color: "text-amber-400",   glow: "oklch(0.70 0.16 75 / 20%)"  },
};

const AGENT_GRADIENTS = [
  "from-violet-600 to-indigo-600",
  "from-indigo-600 to-blue-600",
  "from-blue-600 to-cyan-600",
  "from-cyan-600 to-emerald-600",
];

function agentGradient(id: string) {
  return AGENT_GRADIENTS[(id.charCodeAt(0) ?? 0) % AGENT_GRADIENTS.length];
}

export default function AgentsPage() {
  const { selectedOrgId } = useAppStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [genaiError, setGenaiError] = useState<string | null>(null);

  // Playground state
  const [selectedAgent, setSelectedAgent] = useState("");
  const [message, setMessage] = useState("Hello! What can you do?");
  const [threadId, setThreadId] = useState("");
  const [runMode, setRunMode] = useState<"sync" | "async">("sync");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const fetchAgents = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setGenaiError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE}/organizations/${selectedOrgId}/agents`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 502) {
          setGenaiError("The GenAI service is not reachable. Start apps/genai to use agents.");
        } else {
          setGenaiError(data.message || "Failed to load agents");
        }
        return;
      }
      const list: Agent[] = (data.data?.agents ?? data.data ?? []).map(
        (id: string | Agent) => (typeof id === "string" ? { id } : id),
      );
      setAgents(list);
      if (list.length > 0 && !selectedAgent) setSelectedAgent(list[0].id);
    } catch {
      setGenaiError("Network error — could not reach the API.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedAgent]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleRun = async () => {
    if (!selectedOrgId || !selectedAgent || !message.trim()) return;
    setRunning(true);
    setResult(null);

    const token = localStorage.getItem("token");
    const endpoint = runMode === "sync" ? "run/sync" : "run";
    const body = {
      agent_id: selectedAgent,
      messages: [{ role: "user", content: message.trim() }],
      ...(threadId.trim() ? { thread_id: threadId.trim() } : {}),
    };

    try {
      const res = await fetch(
        `${API_BASE}/organizations/${selectedOrgId}/agents/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Run failed");
        return;
      }
      setResult(data.data ?? data);
    } catch (err: any) {
      toast.error(err.message || "Request failed");
    } finally {
      setRunning(false);
    }
  };

  const copyJSON = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
            {!loading && agents.length > 0 && (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold"
                style={{
                  background: "oklch(0.65 0.22 268 / 15%)",
                  color: "oklch(0.80 0.18 268)",
                  border: "1px solid oklch(0.65 0.22 268 / 25%)",
                }}
              >
                {agents.length}
              </span>
            )}
          </div>
          <p className="text-sm text-white/45 mt-1">
            Browse registered agents and test them in the playground.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchAgents}
          className="gap-2 text-white/40 hover:text-white h-9"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* GenAI unavailable */}
      {genaiError && (
        <Alert
          style={{
            background: "oklch(0.70 0.16 75 / 8%)",
            border: "1px solid oklch(0.70 0.16 75 / 20%)",
          }}
        >
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300/90 text-xs">{genaiError}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="agents" className="space-y-6">
        <TabsList className="h-9 p-1 gap-1" style={{ background: "oklch(1 0 0 / 4%)", border: "1px solid oklch(1 0 0 / 8%)" }}>
          <TabsTrigger value="agents" className="gap-1.5 text-xs px-4 h-7 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Bot className="h-3.5 w-3.5" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="playground" className="gap-1.5 text-xs px-4 h-7 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <FlaskConical className="h-3.5 w-3.5" />
            Playground
          </TabsTrigger>
        </TabsList>

        {/* ── Agents list ── */}
        <TabsContent value="agents" className="space-y-3 mt-0">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : agents.length === 0 && !genaiError ? (
            <div
              className="flex flex-col items-center gap-3 py-16 rounded-2xl"
              style={{ background: "oklch(1 0 0 / 2%)", border: "1px solid oklch(1 0 0 / 7%)" }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "oklch(1 0 0 / 4%)" }}
              >
                <Bot className="h-6 w-6 text-white/30" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white/50">No agents registered</p>
                <p className="text-xs text-white/30 mt-0.5">Register agents in your GenAI service runner.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="group flex items-start gap-3.5 rounded-xl p-4 transition-all hover:scale-[1.01]"
                  style={{
                    background: "oklch(1 0 0 / 3%)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                  }}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${agentGradient(agent.id)}`}
                    style={{ boxShadow: "0 4px 12px oklch(0.60 0.22 268 / 30%)" }}
                  >
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold font-mono truncate">{agent.id}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="status-dot status-dot-active" />
                        <span className="text-[10px] font-semibold text-emerald-400">active</span>
                      </div>
                    </div>
                    <p className="text-xs text-white/40 mt-1">
                      {agent.description ?? "No description provided."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Playground ── */}
        <TabsContent value="playground" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Input panel */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "oklch(1 0 0 / 3%)",
                border: "1px solid oklch(1 0 0 / 8%)",
              }}
            >
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.05]">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{ background: "oklch(0.65 0.22 268 / 15%)" }}
                >
                  <Zap className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">Request</p>
                  <p className="text-xs text-white/35">Configure and fire an agent run.</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Agent</Label>
                  {loading ? (
                    <Skeleton className="h-10 w-full rounded-lg" />
                  ) : (
                    <Select value={selectedAgent} onValueChange={(v) => v && setSelectedAgent(v)}>
                      <SelectTrigger className="h-10 text-xs font-mono bg-white/[0.04] border-white/[0.08]">
                        <SelectValue placeholder="Select agent…" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id} className="text-xs font-mono">
                            {a.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Mode</Label>
                  <Select value={runMode} onValueChange={(v) => setRunMode(v as "sync" | "async")}>
                    <SelectTrigger className="h-10 text-xs bg-white/[0.04] border-white/[0.08]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sync" className="text-xs">Sync — wait for result</SelectItem>
                      <SelectItem value="async" className="text-xs">Async — get session_id, poll later</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Thread ID <span className="text-white/25 normal-case tracking-normal font-medium">(optional)</span>
                  </Label>
                  <Input
                    placeholder="Leave empty to create new thread"
                    value={threadId}
                    onChange={(e) => setThreadId(e.target.value)}
                    className="h-10 text-xs font-mono bg-white/[0.04] border-white/[0.08]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Message</Label>
                  <Textarea
                    placeholder="Type your message…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="text-sm resize-none bg-white/[0.04] border-white/[0.08] font-mono"
                  />
                </div>

                <Button
                  className="w-full h-10 gap-2 font-semibold btn-gradient text-white border-0"
                  onClick={handleRun}
                  disabled={running || !selectedAgent || !message.trim() || !!genaiError}
                >
                  {running ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run Agent
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Output panel */}
            <div
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: "oklch(0.06 0.01 268)",
                border: "1px solid oklch(1 0 0 / 8%)",
              }}
            >
              {/* Terminal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/50" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/50" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-white/30" />
                    <span className="text-xs font-semibold text-white/50">Response</span>
                    {result && (
                      <code className="text-[10px] text-white/20 font-mono">
                        {result.session_id.slice(0, 12)}…
                      </code>
                    )}
                  </div>
                </div>
                {result && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-white hover:bg-white/[0.06]"
                    onClick={() => copyJSON(result)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 p-5">
                {!result && !running && (
                  <div className="flex h-52 items-center justify-center">
                    <div className="text-center">
                      <Terminal className="h-8 w-8 text-white/10 mx-auto mb-2" />
                      <p className="text-xs text-white/25 font-mono">{"// run an agent to see output"}</p>
                    </div>
                  </div>
                )}
                {running && (
                  <div className="flex h-52 items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-xs text-white/35 font-mono">Running agent…</p>
                    </div>
                  </div>
                )}
                {result && !running && (
                  <div className="space-y-3">
                    {/* Status bar */}
                    {(() => {
                      const meta = STATUS_META[result.status] ?? STATUS_META.done;
                      const Icon = meta.icon;
                      return (
                        <div
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                          style={{ background: meta.glow, border: `1px solid ${meta.glow}` }}
                        >
                          <Icon
                            className={`h-4 w-4 ${meta.color} ${result.status === "wip" ? "animate-spin" : ""}`}
                          />
                          <span className={`text-xs font-semibold capitalize ${meta.color}`}>
                            {result.status}
                          </span>
                          {result.duration_ms && (
                            <span className="ml-auto text-[10px] text-white/30 font-mono">
                              {result.duration_ms}ms
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {/* JSON output */}
                    <div className="overflow-auto max-h-60 rounded-lg p-3" style={{ background: "oklch(0.04 0.008 268)" }}>
                      <pre className="text-[11px] font-mono text-emerald-400/80 whitespace-pre-wrap">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Curl example */}
          {selectedAgent && (
            <div
              className="rounded-2xl overflow-hidden mt-4"
              style={{
                background: "oklch(0.06 0.01 268)",
                border: "1px solid oklch(1 0 0 / 8%)",
              }}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-white/30" />
                  <span className="text-xs font-semibold text-white/50">cURL equivalent</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1.5 text-white/30 hover:text-white px-2"
                  onClick={() => {
                    const curl = `curl -X POST \\\n  '${API_BASE}/organizations/${selectedOrgId}/agents/${runMode === "sync" ? "run/sync" : "run"}' \\\n  -H 'Authorization: Bearer <your-jwt>' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\n  "agent_id": "${selectedAgent}",\n  "messages": [{ "role": "user", "content": "${message.replace(/'/g, "\\'").slice(0, 60)}${message.length > 60 ? "…" : ""}" }]\n}'`;
                    navigator.clipboard.writeText(curl);
                    toast.success("Copied cURL to clipboard");
                  }}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="text-[11px] font-mono text-white/50 whitespace-pre">
{`curl -X POST \\
  '${API_BASE}/organizations/${selectedOrgId}/agents/${runMode === "sync" ? "run/sync" : "run"}' \\
  -H 'Authorization: Bearer <your-jwt>' \\
  -H 'Content-Type: application/json' \\
  -d '{
  "agent_id": "${selectedAgent}",
  "messages": [{ "role": "user", "content": "${message.replace(/'/g, "\\'").slice(0, 60)}${message.length > 60 ? "…" : ""}" }]
}'`}
                </pre>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
