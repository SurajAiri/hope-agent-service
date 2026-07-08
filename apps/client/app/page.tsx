"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap,
  BarChart3,
  Shield,
  GitBranch,
  Layers,
  Terminal,
  ArrowRight,
  CheckCircle2,
  Activity,
  Clock,
  TrendingUp,
  Code2,
  Webhook,
  Database,
} from "lucide-react";

/* ─── Stat card ─── */
function StatCard({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 px-8 py-6 rounded-2xl"
      style={{
        background: "oklch(1 0 0 / 3%)",
        border: "1px solid oklch(1 0 0 / 7%)",
      }}
    >
      <span
        className="text-4xl font-bold tracking-tight gradient-text"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
      <span className="text-sm font-semibold text-white/80">{label}</span>
      {sub && <span className="text-xs text-white/40">{sub}</span>}
    </div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div
      className="group relative flex flex-col gap-4 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1"
      style={{
        background: "oklch(1 0 0 / 2.5%)",
        border: "1px solid oklch(1 0 0 / 7%)",
        boxShadow: "0 1px 2px oklch(0 0 0 / 30%)",
      }}
    >
      {/* Icon bubble */}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
        style={{
          background: "oklch(0.65 0.22 268 / 12%)",
          border: "1px solid oklch(0.65 0.22 268 / 25%)",
        }}
      >
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white/90 mb-1.5">{title}</h3>
        <p className="text-sm text-white/50 leading-relaxed">{description}</p>
      </div>
      {/* Hover glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, oklch(0.65 0.22 268 / 8%) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

/* ─── Code snippet ─── */
const CURL_SNIPPET = `curl -X POST 'https://api.yourdomain.com/api/v1/run/sync' \\
  -H 'X-Hope-Token: <your-api-token>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "agent_id": "support-triage",
    "messages": [{ "role": "user", "content": "My order is delayed." }]
  }'`;

/* ─── Main component ─── */
export default function LandingPage() {
  const router = useRouter();
  const checked = useRef(false);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      {/* ── Extra ambient blobs for landing page ── */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, oklch(0.65 0.22 268 / 18%) 0%, transparent 70%)",
        }}
      />

      {/* ══════════════════ NAV ══════════════════ */}
      <nav
        className="relative z-20 flex items-center justify-between px-6 md:px-12 h-16 mx-auto max-w-7xl"
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/icons/logo.png"
            alt="Hope logo"
            className="h-8 w-8 rounded-lg"
            style={{ boxShadow: "0 2px 10px oklch(0.60 0.22 268 / 45%)" }}
          />
          <span className="font-bold text-base tracking-tight gradient-text">
            Hope
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-white/60 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/[0.05]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold px-4 py-2 rounded-lg btn-gradient text-white"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ══════════════════ HERO ══════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 md:px-12 pt-20 pb-24 flex flex-col items-center text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold mb-8"
          style={{
            background: "oklch(0.65 0.22 268 / 10%)",
            border: "1px solid oklch(0.65 0.22 268 / 25%)",
            color: "oklch(0.75 0.18 268)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Now in V1 — production-ready agent infrastructure
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] max-w-4xl mb-6">
          Deploy AI agents{" "}
          <span className="gradient-text">at scale</span>
        </h1>
        <p className="text-lg md:text-xl text-white/55 max-w-2xl leading-relaxed mb-10">
          Hope is the developer platform for building, running, and observing
          production AI agents. Multi-tenant, fully observable, with built-in
          billing and streaming.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl btn-gradient text-white"
          >
            Start building free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl text-white/70 hover:text-white transition-colors"
            style={{ border: "1px solid oklch(1 0 0 / 10%)" }}
          >
            Sign in to dashboard
          </Link>
        </div>

        {/* Hero screenshot */}
        <div className="mt-16 w-full max-w-5xl mx-auto relative">
          <div
            className="absolute inset-0 rounded-3xl"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 100%, oklch(0.65 0.22 268 / 20%) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
            aria-hidden="true"
          />
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              border: "1px solid oklch(1 0 0 / 10%)",
              boxShadow:
                "0 0 0 1px oklch(0 0 0 / 20%), 0 24px 80px oklch(0 0 0 / 50%)",
            }}
          >
            <img
              src="/screenshots/agents-dashboard.jpg"
              alt="Hope dashboard"
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* ══════════════════ STATS ══════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 md:px-12 pb-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard value="3" label="Execution modes" sub="sync · async · stream" />
          <StatCard value="∞" label="Agents supported" sub="any LLM via LiteLLM" />
          <StatCard value="100%" label="Observable" sub="every run traced" />
          <StatCard value="V1" label="Production-ready" sub="checkpoint · webhook" />
        </div>
      </section>

      {/* ══════════════════ FEATURES ══════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 md:px-12 pb-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Everything you need to{" "}
            <span className="gradient-text">ship agents</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            From execution infrastructure to billing and observability — Hope
            handles the platform so you can focus on agent logic.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            icon={Zap}
            title="Three execution modes"
            description="Run agents synchronously for real-time responses, asynchronously for fire-and-forget jobs, or stream tokens over SSE."
          />
          <FeatureCard
            icon={Activity}
            title="Real-time traces"
            description="Every agent run — from the playground or your API — is logged with latency, token counts, and status in real-time."
          />
          <FeatureCard
            icon={BarChart3}
            title="Usage analytics"
            description="Track token consumption, success rates, latency trends, and run mode splits across any time window."
          />
          <FeatureCard
            icon={Shield}
            title="Budget enforcement"
            description="BillManager tracks credit spend per step. Runs are halted automatically when the budget is exceeded."
          />
          <FeatureCard
            icon={Layers}
            title="Multi-tenant orgs"
            description="Full organization isolation with owner, admin, and member roles. Invite your team and collaborate on the same agents."
          />
          <FeatureCard
            icon={Webhook}
            title="Webhook callbacks"
            description="Register webhook URLs per org. Hope sends a callback with session ID and status on every run completion."
          />
          <FeatureCard
            icon={GitBranch}
            title="Checkpoint & restore"
            description="Long-running agents checkpoint state to Redis periodically so interrupted runs can resume exactly where they left off."
          />
          <FeatureCard
            icon={Database}
            title="S3 data persistence"
            description="Execution artifacts and run data are flushed from Redis to S3-compatible storage (MinIO) at the end of every session."
          />
          <FeatureCard
            icon={Code2}
            title="Agent SDK"
            description="Extend any agent with AgentCaller, ResumeCheck, and ToolCaller primitives. The SDK is infra-agnostic — no platform lock-in."
          />
        </div>
      </section>

      {/* ══════════════════ HOW IT WORKS ══════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 md:px-12 pb-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Up and running in{" "}
            <span className="gradient-text">minutes</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            Three steps from zero to your first production agent run.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          {[
            {
              step: "01",
              icon: Terminal,
              title: "Create an API token",
              body: "Sign up, create your org, and generate an API token from the dashboard. Tokens are scoped to your organization.",
            },
            {
              step: "02",
              icon: Layers,
              title: "Browse registered agents",
              body: "View all agents registered in your runner. Test them live in the playground before wiring them to production.",
            },
            {
              step: "03",
              icon: Zap,
              title: "Fire your first run",
              body: "Call POST /api/v1/run/sync with your token and agent_id. Get a full response — or stream tokens — right away.",
            },
          ].map(({ step, icon: Icon, title, body }) => (
            <div
              key={step}
              className="relative flex flex-col gap-4 rounded-2xl p-6"
              style={{
                background: "oklch(1 0 0 / 2.5%)",
                border: "1px solid oklch(1 0 0 / 7%)",
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-bold tracking-widest"
                  style={{ color: "oklch(0.65 0.22 268 / 60%)" }}
                >
                  {step}
                </span>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{
                    background: "oklch(0.65 0.22 268 / 10%)",
                    border: "1px solid oklch(0.65 0.22 268 / 20%)",
                  }}
                >
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </div>
              <h3 className="text-sm font-semibold text-white/90">{title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Code block */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            border: "1px solid oklch(1 0 0 / 8%)",
            background: "oklch(0.06 0.010 268)",
          }}
        >
          {/* Terminal chrome */}
          <div
            className="flex items-center gap-2 px-5 py-3"
            style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)" }}
          >
            <div className="h-3 w-3 rounded-full bg-red-500/70" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <div className="h-3 w-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs text-white/30 font-mono">
              Quick start — cURL
            </span>
          </div>
          <pre className="px-6 py-5 overflow-x-auto text-sm font-mono leading-relaxed text-white/75">
            <code>{CURL_SNIPPET}</code>
          </pre>
        </div>
      </section>

      {/* ══════════════════ SCREENSHOTS ROW ══════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 md:px-12 pb-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            A dashboard built for{" "}
            <span className="gradient-text">developers</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            Inspect every run, debug failures, and track usage — all from one
            clean interface.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            {
              src: "/screenshots/agents-playground.jpg",
              label: "Agent Playground",
              desc: "Test any registered agent interactively. Choose sync, async, or stream mode and inspect responses in GUI or raw JSON.",
            },
            {
              src: "/screenshots/agents-traces.jpg",
              label: "Traces",
              desc: "Every invocation — from the playground or your API — is logged with latency, token counts, source, and final status.",
            },
            {
              src: "/screenshots/agents-analytics.jpg",
              label: "Analytics",
              desc: "Visualise runs over time, token usage trends, success rate, and execution mode split. Available at 7d, 30d, 90d windows.",
            },
            {
              src: "/screenshots/agents-dashboard.jpg",
              label: "Overview Dashboard",
              desc: "Your organisation at a glance. Jump straight to API tokens, agents, traces, or analytics from a single hub.",
            },
          ].map(({ src, label, desc }) => (
            <div
              key={label}
              className="group flex flex-col gap-4 rounded-2xl overflow-hidden"
              style={{
                border: "1px solid oklch(1 0 0 / 8%)",
                background: "oklch(0.065 0.010 268)",
              }}
            >
              <div className="relative overflow-hidden">
                <img
                  src={src}
                  alt={label}
                  className="w-full transition-transform duration-500 group-hover:scale-[1.02]"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom, transparent 60%, oklch(0.065 0.010 268) 100%)",
                  }}
                />
              </div>
              <div className="px-6 pb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-1">
                  {label}
                </p>
                <p className="text-sm text-white/55 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════ CHECKLIST ══════════════════ */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 md:px-12 pb-28">
        <div
          className="rounded-3xl p-8 md:p-12 flex flex-col md:flex-row gap-10 items-start"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 50% 0%, oklch(0.65 0.22 268 / 10%) 0%, oklch(1 0 0 / 2%) 100%)",
            border: "1px solid oklch(0.65 0.22 268 / 20%)",
          }}
        >
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              V1 ships with everything <span className="gradient-text">production needs</span>
            </h2>
            <p className="text-white/50 text-sm leading-relaxed">
              No vendor lock-in. No black-box orchestration. Just clean
              primitives on top of Redis, PostgreSQL, and S3.
            </p>
          </div>
          <div className="flex-1 grid grid-cols-1 gap-2.5">
            {[
              "Singleton Engine with ExecutionManager",
              "BillManager + per-step credit tracking",
              "UsageTracker with DB persistence",
              "AgentRunner + ToolCaller (AgentCaller)",
              "Smart Streamer (SSE / gRPC ready)",
              "ResumeCheck template method pattern",
              "Redis checkpoint & restore",
              "Webhook callbacks on completion",
              "Multi-tenant org management",
              "Playground, Traces & Analytics UI",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-white/70">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ CTA FOOTER ══════════════════ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 md:px-12 pb-32 text-center">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
          Ready to deploy your{" "}
          <span className="gradient-text">first agent?</span>
        </h2>
        <p className="text-white/50 text-lg mb-10 max-w-lg mx-auto">
          Create your organization, add your API token, and start running agents
          in production in minutes.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl btn-gradient text-white"
          >
            Create your account
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-white/50 hover:text-white transition-colors px-6 py-3.5"
          >
            Already have an account →
          </Link>
        </div>
      </section>

      {/* ══════════════════ FOOTER ══════════════════ */}
      <footer
        className="relative z-10 border-t"
        style={{ borderColor: "oklch(1 0 0 / 6%)" }}
      >
        <div className="mx-auto max-w-7xl px-6 md:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img
              src="/icons/logo.png"
              alt="Hope logo"
              className="h-6 w-6 rounded-md"
            />
            <span className="text-sm font-semibold gradient-text">Hope</span>
            <span className="text-xs text-white/30">
              — Developer Platform for AI Agents
            </span>
          </div>
          <p className="text-xs text-white/30">
            Built with FastAPI · Node.js · Next.js · LiteLLM
          </p>
        </div>
      </footer>
    </div>
  );
}
