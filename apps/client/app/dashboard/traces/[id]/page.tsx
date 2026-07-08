"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, Play, Pause, AlertCircle 
} from "lucide-react";

import { 
  ReactFlow, 
  Background, 
  Controls, 
  MarkerType, 
  Handle, 
  Position, 
  Node, 
  Edge,
  useNodesState,
  useEdgesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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

// Custom Nodes
const CustomNode = ({ data, type }: any) => {
  let title = "Node";
  let color = "oklch(1 0 0 / 50%)";
  let bg = "oklch(1 0 0 / 5%)";
  
  if (type === "user") { title = "User Input"; color = "text-emerald-400"; bg = "oklch(0.72 0.18 145 / 10%)"; }
  if (type === "assistant") { title = "Assistant"; color = "text-blue-400"; bg = "oklch(0.60 0.18 235 / 10%)"; }
  if (type === "tool") { title = "Tool Call / Result"; color = "text-amber-400"; bg = "oklch(0.70 0.16 75 / 10%)"; }

  return (
    <div className="rounded-xl p-4 min-w-[250px] max-w-[400px] shadow-lg backdrop-blur-md" 
         style={{ background: bg, border: "1px solid oklch(1 0 0 / 10%)" }}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-white/50 border-0" />
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${color}`}>
        {title}
      </div>
      <div className="text-xs text-white/80 whitespace-pre-wrap max-h-[300px] overflow-auto custom-scrollbar font-mono">
        {data.content}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-white/50 border-0" />
    </div>
  );
};

const nodeTypes = {
  userNode: (props: any) => <CustomNode {...props} type="user" />,
  assistantNode: (props: any) => <CustomNode {...props} type="assistant" />,
  toolNode: (props: any) => <CustomNode {...props} type="tool" />,
};

export default function TraceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { selectedOrgId } = useAppStore();
  const [trace, setTrace] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!selectedOrgId || !params.id) return;
    
    const fetchTrace = async () => {
      try {
        const res = await api.get(`/organizations/${selectedOrgId}/traces/${params.id}`);
        const data = res?.data?.data || res?.data;
        setTrace(data);
        
        // Build graph
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        let yOffset = 50;
        let lastNodeId = "";

        const addNode = (id: string, type: string, content: string) => {
          newNodes.push({
            id,
            type,
            position: { x: 250, y: yOffset },
            data: { content },
          });
          if (lastNodeId) {
            newEdges.push({
              id: `e-${lastNodeId}-${id}`,
              source: lastNodeId,
              target: id,
              animated: true,
              style: { stroke: 'oklch(1 0 0 / 30%)', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'oklch(1 0 0 / 30%)' }
            });
          }
          lastNodeId = id;
          yOffset += 200; // rough spacing
        };

        // Input
        if (data.input) {
          addNode("input", "userNode", JSON.stringify(data.input, null, 2));
        }

        // Output messages if available
        if (data.output && Array.isArray(data.output.messages)) {
          data.output.messages.forEach((msg: any, idx: number) => {
            const type = msg.role === "tool" ? "toolNode" : msg.role === "assistant" ? "assistantNode" : "userNode";
            addNode(`msg-${idx}`, type, typeof msg.content === 'string' ? msg.content : JSON.stringify(msg, null, 2));
          });
        } else if (data.output) {
          addNode("output", "assistantNode", JSON.stringify(data.output, null, 2));
        }

        setNodes(newNodes);
        setEdges(newEdges);
      } catch (e: any) {
        toast.error(e.message || "Failed to load trace");
      } finally {
        setLoading(false);
      }
    };
    
    fetchTrace();
  }, [selectedOrgId, params.id, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!trace) {
    return <div>Trace not found</div>;
  }

  const meta = STATUS_META[trace.status] ?? STATUS_META.done;
  const StatusIcon = meta.icon;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      {/* Header / Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl shrink-0" 
           style={{ background: "oklch(1 0 0 / 3%)", border: "1px solid oklch(1 0 0 / 7%)" }}>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 text-white/50 hover:text-white rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold tracking-tight font-mono">{trace.agentId}</h1>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: "oklch(1 0 0 / 6%)", color: "oklch(0.75 0 0)" }}>
                {trace.runMode}
              </span>
            </div>
            <p className="text-xs text-white/50 font-mono">Trace ID: {trace.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Tokens</p>
            <p className="text-sm font-mono mt-0.5">↑{trace.tokensIn ?? 0} &nbsp; ↓{trace.tokensOut ?? 0}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Duration</p>
            <p className="text-sm font-mono mt-0.5">{formatDuration(trace.durationMs)}</p>
          </div>
          <div className="text-right flex flex-col items-end">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Status</p>
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold capitalize"
                  style={{ background: meta.bg, color: meta.color }}>
              <StatusIcon className={`h-3.5 w-3.5 ${trace.status === 'running' ? 'animate-spin' : ''}`} />
              {trace.status}
            </span>
          </div>
        </div>
      </div>

      {trace.error && (
        <div className="rounded-xl p-4 flex gap-3 shrink-0" style={{ background: "oklch(0.55 0.22 25 / 15%)", border: "1px solid oklch(0.55 0.22 25 / 30%)" }}>
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-300 font-mono whitespace-pre-wrap">{trace.error}</p>
        </div>
      )}

      {/* Node Graph Area */}
      <div className="flex-1 rounded-2xl overflow-hidden relative" style={{ background: "oklch(0.04 0.01 268)", border: "1px solid oklch(1 0 0 / 8%)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          className="dark"
        >
          <Background color="oklch(1 0 0 / 10%)" gap={16} />
          <Controls className="bg-white/5 border-white/10 fill-white/60 !shadow-none" />
        </ReactFlow>
      </div>
    </div>
  );
}
