import { Request, Response } from "express";
import { AgentService } from "@/features/agents/agent.service";
import { TracesService } from "@/features/traces/traces.service";
import { ApiResponse } from "@/shared/utils/ApiResponse";
import { asyncHandler } from "@/shared/utils/asyncHandler";

const agentService = new AgentService();
const tracesService = new TracesService();

/**
 * Controller for the flat developer run endpoints (/api/v1/run/*).
 *
 * Reuses AgentService for all GenAI communication.
 * Logs every run to TracesService (fire-and-forget — failures do not
 * affect the response sent to the developer).
 */
export class RunController {
  /**
   * POST /api/v1/run
   * Fire-and-forget — returns session_id immediately.
   */
  triggerRun = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const startMs = Date.now();

    const body = { ...req.body, org_id: orgId };
    const data = await agentService.triggerRun(body);

    // Log async (non-blocking)
    tracesService
      .logRun({
        orgId,
        agentId: req.body.agent_id,
        sessionId: data?.session_id ?? null,
        runMode: "async",
        status: "queued",
        input: req.body.messages,
        triggeredBy: "api_token",
        durationMs: Date.now() - startMs,
      })
      .catch((err) =>
        console.error("[RunController] Failed to log async run:", err),
      );

    res
      .status(202)
      .json(new ApiResponse(202, data, "Agent run queued successfully"));
  });

  /**
   * POST /api/v1/run/sync
   * Blocking — waits for the agent to complete.
   */
  triggerRunSync = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const startMs = Date.now();

    const body = { ...req.body, org_id: orgId };
    let data: any;
    let runError: string | undefined;

    try {
      data = await agentService.triggerRunSync(body);
    } catch (err: any) {
      runError = err?.message ?? "Unknown error";
      throw err; // re-throw so error middleware handles HTTP response
    } finally {
      // Log regardless of success/failure
      tracesService
        .logRun({
          orgId,
          agentId: req.body.agent_id,
          sessionId: data?.session_id ?? null,
          runMode: "sync",
          status: runError ? "failed" : (data?.status ?? "done"),
          input: req.body.messages,
          output: data ?? null,
          tokensIn: data?.usage?.input_tokens ?? null,
          tokensOut: data?.usage?.output_tokens ?? null,
          durationMs: Date.now() - startMs,
          error: runError ?? null,
          triggeredBy: "api_token",
        })
        .catch((logErr) =>
          console.error("[RunController] Failed to log sync run:", logErr),
        );
    }

    res
      .status(200)
      .json(new ApiResponse(200, data, "Agent run completed successfully"));
  });

  /**
   * POST /api/v1/run/stream
   * SSE streaming — pipes token-by-token output from the GenAI service.
   */
  triggerRunStream = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const startMs = Date.now();

    const body = { ...req.body, org_id: orgId };

    // Log immediately as "running" since streaming doesn't return structured output
    tracesService
      .logRun({
        orgId,
        agentId: req.body.agent_id,
        runMode: "stream",
        status: "running",
        input: req.body.messages,
        triggeredBy: "api_token",
        durationMs: Date.now() - startMs,
      })
      .catch((err) =>
        console.error("[RunController] Failed to log stream run:", err),
      );

    await agentService.triggerRunStream(body, res);
  });
}
