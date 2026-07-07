import { Request, Response } from "express";
import { AgentService } from "./agent.service";
import { TracesService } from "@/features/traces/traces.service";
import { ApiResponse } from "@/shared/utils/ApiResponse";
import { asyncHandler } from "@/shared/utils/asyncHandler";

const agentService = new AgentService();
const tracesService = new TracesService();

export class AgentController {
  /**
   * GET /
   * List all registered agent IDs from the GenAI service.
   */
  listAgents = asyncHandler(async (req: Request, res: Response) => {
    console.log("[AgentController] listAgents called");
    const data = await agentService.listAgents();
    res
      .status(200)
      .json(new ApiResponse(200, data, "Agents listed successfully"));
  });

  /**
   * POST /run
   * Fire-and-forget — returns session_id immediately.
   * The agent runs in the background; use GET /session/:id/status to poll.
   */
  triggerRun = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const startMs = Date.now();
    console.log(
      `[AgentController] triggerRun called for orgId: ${orgId} agent: ${req.body.agent_id}`,
    );

    const body = { ...req.body, org_id: orgId };
    const data = await agentService.triggerRun(body);
    console.log(
      `[AgentController] triggerRun queued session: ${data?.session_id}`,
    );

    tracesService
      .logRun({
        orgId,
        agentId: req.body.agent_id,
        sessionId: data?.session_id ?? null,
        threadId: req.body.thread_id ?? null,
        runMode: "async",
        status: "queued",
        input: req.body.messages,
        triggeredBy: "playground",
        durationMs: Date.now() - startMs,
      })
      .catch((err) => console.error("[AgentController] log error:", err));

    res
      .status(202)
      .json(new ApiResponse(202, data, "Agent run queued successfully"));
  });

  /**
   * POST /run/sync
   * Blocking — waits for the agent to complete before responding.
   */
  triggerRunSync = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const startMs = Date.now();
    console.log(
      `[AgentController] triggerRunSync called for orgId: ${orgId} agent: ${req.body.agent_id}`,
    );

    const body = { ...req.body, org_id: orgId };
    let data: any;
    let runError: string | undefined;

    try {
      data = await agentService.triggerRunSync(body);
      console.log(
        `[AgentController] triggerRunSync completed session: ${data?.session_id} status: ${data?.status}`,
      );
    } catch (err: any) {
      runError = err?.message ?? "Unknown error";
      throw err;
    } finally {
      tracesService
        .logRun({
          orgId,
          agentId: req.body.agent_id,
          sessionId: data?.session_id ?? null,
          threadId: req.body.thread_id ?? null,
          runMode: "sync",
          status: runError ? "failed" : (data?.status ?? "done"),
          input: req.body.messages,
          output: data ?? null,
          tokensIn: data?.usage?.input_tokens ?? null,
          tokensOut: data?.usage?.output_tokens ?? null,
          durationMs: Date.now() - startMs,
          error: runError ?? null,
          triggeredBy: "playground",
        })
        .catch((err) => console.error("[AgentController] log error:", err));
    }

    res
      .status(200)
      .json(new ApiResponse(200, data, "Agent run completed successfully"));
  });

  /**
   * POST /run/stream
   * SSE streaming — pipes token-by-token output from the GenAI service.
   */
  triggerRunStream = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const startMs = Date.now();
    console.log(
      `[AgentController] triggerRunStream called for orgId: ${orgId} agent: ${req.body.agent_id}`,
    );

    tracesService
      .logRun({
        orgId,
        agentId: req.body.agent_id,
        threadId: req.body.thread_id ?? null,
        runMode: "stream",
        status: "running",
        input: req.body.messages,
        triggeredBy: "playground",
        durationMs: Date.now() - startMs,
      })
      .catch((err) => console.error("[AgentController] log error:", err));

    const body = { ...req.body, org_id: orgId };
    await agentService.triggerRunStream(body, res);
  });

  /**
   * GET /session/:sessionId/status
   * Poll the live status of a run from Redis (queue | wip | done | fail | hitl).
   */
  getSessionStatus = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params["sessionId"] as string;
    console.log(
      `[AgentController] getSessionStatus called for session: ${sessionId}`,
    );
    const data = await agentService.getSessionStatus(sessionId);
    res
      .status(200)
      .json(new ApiResponse(200, data, "Session status fetched successfully"));
  });

  /**
   * GET /session/:sessionId
   * Get the completed run result and state snapshot.
   */
  getSessionResult = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params["sessionId"] as string;
    console.log(
      `[AgentController] getSessionResult called for session: ${sessionId}`,
    );
    const data = await agentService.getSessionResult(sessionId);
    res
      .status(200)
      .json(new ApiResponse(200, data, "Session result fetched successfully"));
  });

  /**
   * GET /session/:sessionId/hitl
   * List pending human-in-the-loop actions for a paused (status == "hitl") run.
   */
  getHitlActions = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params["sessionId"] as string;
    console.log(
      `[AgentController] getHitlActions called for session: ${sessionId}`,
    );
    const data = await agentService.getHitlActions(sessionId);
    res
      .status(200)
      .json(new ApiResponse(200, data, "HITL actions fetched successfully"));
  });

  /**
   * POST /session/:sessionId/hitl
   * Submit human responses for a paused run and re-trigger execution.
   */
  submitHitlResponse = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params["sessionId"] as string;
    console.log(
      `[AgentController] submitHitlResponse called for session: ${sessionId}`,
    );
    const data = await agentService.submitHitlResponse(sessionId, req.body);
    console.log(
      `[AgentController] submitHitlResponse submitted for session: ${sessionId}`,
    );
    res
      .status(200)
      .json(new ApiResponse(200, data, "HITL response submitted successfully"));
  });
}
