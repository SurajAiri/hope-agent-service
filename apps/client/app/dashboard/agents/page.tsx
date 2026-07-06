"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const STATUS_ICON: Record<string, React.ElementType> = {
  done: CheckCircle2,
  fail: XCircle,
  wip: Loader2,
  queue: Clock,
};

const STATUS_COLOR: Record<string, string> = {
  done:  "text-emerald-400",
  fail:  "text-red-400",
  wip:   "text-blue-400",
  queue: "text-amber-400",
};

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse registered agents and test them in the playground.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchAgents} className="gap-2 text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* GenAI unavailable */}
      {genaiError && (
        <Alert className="border-amber-400/30 bg-amber-400/5">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300 text-xs">{genaiError}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="agents" className="text-xs px-3 h-6">Agents</TabsTrigger>
          <TabsTrigger value="playground" className="text-xs px-3 h-6">Playground</TabsTrigger>
        </TabsList>

        {/* ── Agents list ── */}
        <TabsContent value="agents" className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : agents.length === 0 && !genaiError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Bot className="h-10 w-10 opacity-20" />
              <p className="text-sm">No agents registered</p>
              <p className="text-xs">Register agents in your GenAI service runner.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 hover:border-border/80 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 border border-primary/20 shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium font-mono">{agent.id}</p>
                      <Badge variant="secondary" className="text-[10px]">active</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {agent.description ?? "No description provided."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Playground ── */}
        <TabsContent value="playground" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Input panel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Request</CardTitle>
                <CardDescription className="text-xs">
                  Configure and fire an agent run.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Agent</Label>
                  {loading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                      <SelectTrigger className="h-9 text-xs font-mono">
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
                  <Label className="text-xs">Mode</Label>
                  <Select value={runMode} onValueChange={(v) => setRunMode(v as "sync" | "async")}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sync" className="text-xs">Sync — wait for result</SelectItem>
                      <SelectItem value="async" className="text-xs">Async — get session_id, poll later</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Thread ID <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    placeholder="Leave empty to create new thread"
                    value={threadId}
                    onChange={(e) => setThreadId(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Message</Label>
                  <Textarea
                    placeholder="Type your message…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="text-sm resize-none"
                  />
                </div>

                <Button
                  className="w-full gap-2"
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
                      Run
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Output panel */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Response</CardTitle>
                    <CardDescription className="text-xs">
                      {result ? `session_id: ${result.session_id}` : "Run an agent to see the response."}
                    </CardDescription>
                  </div>
                  {result && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyJSON(result)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!result && !running && (
                  <div className="flex h-[260px] items-center justify-center text-muted-foreground">
                    <p className="text-xs">No results yet</p>
                  </div>
                )}
                {running && (
                  <div className="flex h-[260px] items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-xs">Running agent…</p>
                    </div>
                  </div>
                )}
                {result && !running && (
                  <div className="space-y-3">
                    {/* Status */}
                    <div className="flex items-center gap-2">
                      {(() => {
                        const Icon = STATUS_ICON[result.status] ?? CheckCircle2;
                        return (
                          <Icon
                            className={`h-4 w-4 ${STATUS_COLOR[result.status] ?? "text-muted-foreground"} ${result.status === "wip" ? "animate-spin" : ""}`}
                          />
                        );
                      })()}
                      <span className={`text-xs font-medium capitalize ${STATUS_COLOR[result.status] ?? ""}`}>
                        {result.status}
                      </span>
                      {result.duration_ms && (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {result.duration_ms}ms
                        </span>
                      )}
                    </div>
                    <Separator />
                    {/* Raw JSON */}
                    <div className="rounded-md border border-border bg-secondary/40 p-3 overflow-auto max-h-[220px]">
                      <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Curl example */}
          {selectedAgent && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">cURL equivalent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-border bg-secondary/40 p-3 overflow-x-auto">
                  <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre">
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
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
