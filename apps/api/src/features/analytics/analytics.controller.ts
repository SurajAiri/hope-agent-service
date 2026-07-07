import { Request, Response } from "express";
import { AnalyticsService } from "./analytics.service";
import { ApiResponse } from "@/shared/utils/ApiResponse";
import { asyncHandler } from "@/shared/utils/asyncHandler";

const analyticsService = new AnalyticsService();

/** Parse `from` / `to` query params with sensible defaults (last 30 days). */
function parseDateRange(query: Record<string, string>) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export class AnalyticsController {
  /**
   * GET /api/v1/organizations/:organizationId/analytics
   *
   * Returns all analytics data in one call so the frontend makes a single
   * round-trip to populate the full dashboard.
   *
   * Query params: from, to (ISO dates), agentId (optional)
   */
  getAll = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);
    const filters = { from, to, agentId: q.agentId || undefined };

    const [overview, runsOverTime, statusDist, topAgents, tokenUsage, modeDist] =
      await Promise.all([
        analyticsService.getOverview(orgId, filters),
        analyticsService.getRunsOverTime(orgId, filters),
        analyticsService.getStatusDistribution(orgId, filters),
        analyticsService.getTopAgents(orgId, filters),
        analyticsService.getTokenUsageOverTime(orgId, filters),
        analyticsService.getRunModeDistribution(orgId, filters),
      ]);

    res.status(200).json(
      new ApiResponse(
        200,
        { overview, runsOverTime, statusDist, topAgents, tokenUsage, modeDist },
        "Analytics fetched successfully",
      ),
    );
  });
}
