import { Response } from "express";
import { ApiError } from "@/shared/utils/ApiError";

const GENAI_SERVICE_URL =
  process.env.GENAI_SERVICE_URL || "http://localhost:8000";

/**
 * Build the standard headers for every internal request to the Python FastAPI
 * GenAI service. The `AUTHORIZATION_SECRET_KEY` is the shared secret that
 * Node.js and Python both know — it never leaves the server tier.
 */
function getInternalHeaders(): Record<string, string> {
  const secret = process.env.AUTHORIZATION_SECRET_KEY;
  if (!secret) {
    throw new ApiError(
      500,
      "Server misconfiguration: AUTHORIZATION_SECRET_KEY is not set",
    );
  }
  return {
    "Content-Type": "application/json",
    "X-API-Key": secret,
  };
}

/**
 * Translate a non-2xx HTTP response from the GenAI service into an ApiError.
 * Tries to read a `detail` field from the JSON body (FastAPI convention).
 */
async function handleUpstreamError(
  response: globalThis.Response,
  fallbackMsg: string,
): Promise<never> {
  let detail = fallbackMsg;
  try {
    const body = await response.json();
    detail = body?.detail ?? body?.message ?? fallbackMsg;
  } catch {
    // response body was not JSON — use fallback
  }
  throw new ApiError(response.status >= 500 ? 502 : response.status, detail);
}

/**
 * Execute a fetch against the GenAI service, converting network-level
 * failures (connection refused, timeout, DNS, etc.) into a 502 Bad Gateway
 * ApiError rather than an untyped runtime error.
 */
async function safeFetch(
  url: string,
  options?: RequestInit,
): Promise<globalThis.Response> {
  try {
    return await fetch(url, options);
  } catch (err: any) {
    throw new ApiError(
      502,
      `GenAI service is unreachable: ${err?.message ?? "fetch failed"}`,
    );
  }
}

export class AgentService {
  // ── Agent listing ─────────────────────────────────────────────────────────

  /**
   * List all agent IDs registered in the Python runner.
   * GET /api/v1/agents
   */
  async listAgents() {
    const response = await safeFetch(`${GENAI_SERVICE_URL}/api/v1/agents`, {
      headers: getInternalHeaders(),
    });
    if (!response.ok) {
      await handleUpstreamError(response, "Failed to list agents");
    }
    return response.json();
  }

  // ── Agent run triggers ─────────────────────────────────────────────────────

  /**
   * Fire-and-forget run — returns session_id immediately while engine runs
   * in the background.
   * POST /api/v1/call
   */
  async triggerRun(body: object) {
    const response = await safeFetch(`${GENAI_SERVICE_URL}/api/v1/call`, {
      method: "POST",
      headers: getInternalHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await handleUpstreamError(response, "Failed to trigger agent run");
    }
    return response.json();
  }

  /**
   * Blocking run — waits for the agent to finish before responding.
   * POST /api/v1/call/sync
   */
  async triggerRunSync(body: object) {
    const response = await safeFetch(`${GENAI_SERVICE_URL}/api/v1/call/sync`, {
      method: "POST",
      headers: getInternalHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await handleUpstreamError(response, "Failed to trigger synchronous agent run");
    }
    return response.json();
  }

  /**
   * Streaming run — pipes Server-Sent Events from the Python service directly
   * to the client `res` object. Writes response headers itself.
   *
   * Contract:
   *   - If the upstream fetch fails BEFORE any data is written, throws ApiError
   *     (the caller's asyncHandler can still send a proper error response).
   *   - After headers are sent, mid-stream errors are logged and the connection
   *     is closed cleanly.
   *
   * POST /api/v1/call/stream
   */
  async triggerRunStream(body: object, res: Response) {
    const response = await safeFetch(`${GENAI_SERVICE_URL}/api/v1/call/stream`, {
      method: "POST",
      headers: getInternalHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Haven't written anything yet — safe to throw and let error handler respond
      await handleUpstreamError(response, "Failed to trigger streaming agent run");
    }

    // ── Start SSE response ─────────────────────────────────────────────────
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx proxy buffering
    });

    if (!response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();

    // Cancel the upstream reader if the client disconnects early
    res.on("close", () => {
      reader.cancel().catch(() => {});
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || res.writableEnded) break;
        res.write(value);
      }
    } catch (error) {
      // Mid-stream errors — can't change status code, just log and close
      console.error("[AgentService] SSE stream error:", error);
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  // ── Session management ────────────────────────────────────────────────────

  /**
   * Poll the live status of a run from Redis.
   * GET /api/v1/session/status/:sessionId
   */
  async getSessionStatus(sessionId: string) {
    const response = await safeFetch(
      `${GENAI_SERVICE_URL}/api/v1/session/status/${encodeURIComponent(sessionId)}`,
      { headers: getInternalHeaders() },
    );
    if (!response.ok) {
      await handleUpstreamError(response, "Failed to get session status");
    }
    return response.json();
  }

  /**
   * Get the completed run result and metadata.
   * GET /api/v1/session/:sessionId
   */
  async getSessionResult(sessionId: string) {
    const response = await safeFetch(
      `${GENAI_SERVICE_URL}/api/v1/session/${encodeURIComponent(sessionId)}`,
      { headers: getInternalHeaders() },
    );
    if (!response.ok) {
      await handleUpstreamError(response, "Failed to get session result");
    }
    return response.json();
  }

  // ── HITL (Human-in-the-Loop) ──────────────────────────────────────────────

  /**
   * Get pending HITL actions for a paused run (status == "hitl").
   * GET /api/v1/session/:sessionId/hitl
   */
  async getHitlActions(sessionId: string) {
    const response = await safeFetch(
      `${GENAI_SERVICE_URL}/api/v1/session/${encodeURIComponent(sessionId)}/hitl`,
      { headers: getInternalHeaders() },
    );
    if (!response.ok) {
      await handleUpstreamError(response, "Failed to get HITL actions");
    }
    return response.json();
  }

  /**
   * Submit human responses for a paused run and re-trigger execution.
   * Body is just the answer(s): [{ action_id, response }, ...] — not the
   * full action list.
   * POST /api/v1/session/:sessionId/hitl
   */
  async submitHitlResponse(sessionId: string, responses: object[]) {
    const response = await safeFetch(
      `${GENAI_SERVICE_URL}/api/v1/session/${encodeURIComponent(sessionId)}/hitl`,
      {
        method: "POST",
        headers: getInternalHeaders(),
        body: JSON.stringify(responses),
      },
    );
    if (!response.ok) {
      await handleUpstreamError(response, "Failed to submit HITL response");
    }
    return response.json();
  }
}
