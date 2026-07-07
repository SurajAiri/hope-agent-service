import { Request, Response } from "express";
import { TracesService } from "./traces.service";
import { ApiResponse } from "@/shared/utils/ApiResponse";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ApiError } from "@/shared/utils/ApiError";

const tracesService = new TracesService();

export class TracesController {
  /**
   * GET /api/v1/organizations/:organizationId/traces
   *
   * Query params:
   *   agentId, status, from (ISO date), to (ISO date), limit (default 50), offset (default 0)
   */
  listRuns = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;

    const { agentId, status, sessionId, threadId, from, to, limit, offset } = req.query as Record<string, string>;

    const { runs, total } = await tracesService.listRuns(orgId, {
      agentId: agentId || undefined,
      status: status || undefined,
      sessionId: sessionId || undefined,
      threadId: threadId || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    res.status(200).json(
      new ApiResponse(200, { runs, total }, "Run traces fetched successfully"),
    );
  });

  /**
   * GET /api/v1/organizations/:organizationId/traces/:id
   */
  getRun = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const id = req.params["id"] as string;

    const run = await tracesService.getRun(orgId, id);
    if (!run) throw new ApiError(404, "Trace not found");

    res.status(200).json(new ApiResponse(200, run, "Trace fetched successfully"));
  });
}
