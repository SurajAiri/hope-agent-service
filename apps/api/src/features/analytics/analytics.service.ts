import { db } from "@/db";
import { RunLogTable } from "@/db/run-log.schema";
import { and, eq, gte, lte, count, avg, sum, sql } from "drizzle-orm";

export interface AnalyticsFilters {
  from: Date;
  to: Date;
  agentId?: string;
}

export class AnalyticsService {
  private conditions(orgId: string, filters: AnalyticsFilters) {
    const conds = [
      eq(RunLogTable.orgId, orgId),
      gte(RunLogTable.createdAt, filters.from),
      lte(RunLogTable.createdAt, filters.to),
    ];
    if (filters.agentId) conds.push(eq(RunLogTable.agentId, filters.agentId));
    return conds;
  }

  /**
   * Top-level summary cards:
   *   totalRuns, successRate (%), avgDurationMs, totalTokensIn, totalTokensOut
   */
  async getOverview(orgId: string, filters: AnalyticsFilters) {
    const conds = this.conditions(orgId, filters);

    const [row] = await db
      .select({
        totalRuns: count(),
        avgDurationMs: avg(RunLogTable.durationMs),
        totalTokensIn: sum(RunLogTable.tokensIn),
        totalTokensOut: sum(RunLogTable.tokensOut),
        doneCount: sql<number>`COUNT(*) FILTER (WHERE ${RunLogTable.status} = 'done')`,
        failedCount: sql<number>`COUNT(*) FILTER (WHERE ${RunLogTable.status} = 'failed')`,
      })
      .from(RunLogTable)
      .where(and(...conds));

    const totalRuns = Number(row.totalRuns ?? 0);
    const doneCount = Number(row.doneCount ?? 0);
    const successRate =
      totalRuns > 0 ? Math.round((doneCount / totalRuns) * 100) : 0;

    return {
      totalRuns,
      successRate,
      avgDurationMs: Math.round(Number(row.avgDurationMs ?? 0)),
      totalTokensIn: Number(row.totalTokensIn ?? 0),
      totalTokensOut: Number(row.totalTokensOut ?? 0),
    };
  }

  /**
   * Daily run count grouped by date (for line chart).
   */
  async getRunsOverTime(orgId: string, filters: AnalyticsFilters) {
    const conds = this.conditions(orgId, filters);

    const rows = await db
      .select({
        date: sql<string>`DATE(${RunLogTable.createdAt})`.as("date"),
        count: count(),
      })
      .from(RunLogTable)
      .where(and(...conds))
      .groupBy(sql`DATE(${RunLogTable.createdAt})`)
      .orderBy(sql`DATE(${RunLogTable.createdAt})`);

    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  /**
   * Run status distribution (for donut / bar chart).
   */
  async getStatusDistribution(orgId: string, filters: AnalyticsFilters) {
    const conds = this.conditions(orgId, filters);

    const rows = await db
      .select({
        status: RunLogTable.status,
        count: count(),
      })
      .from(RunLogTable)
      .where(and(...conds))
      .groupBy(RunLogTable.status);

    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
  }

  /**
   * Top agents by call count with avg duration (for leaderboard table).
   */
  async getTopAgents(orgId: string, filters: AnalyticsFilters) {
    const conds = this.conditions(orgId, filters);

    const rows = await db
      .select({
        agentId: RunLogTable.agentId,
        count: count(),
        avgDurationMs: avg(RunLogTable.durationMs),
      })
      .from(RunLogTable)
      .where(and(...conds))
      .groupBy(RunLogTable.agentId)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    return rows.map((r) => ({
      agentId: r.agentId,
      count: Number(r.count),
      avgDurationMs: Math.round(Number(r.avgDurationMs ?? 0)),
    }));
  }

  /**
   * Daily token usage (input + output) for area chart.
   */
  async getTokenUsageOverTime(orgId: string, filters: AnalyticsFilters) {
    const conds = this.conditions(orgId, filters);

    const rows = await db
      .select({
        date: sql<string>`DATE(${RunLogTable.createdAt})`.as("date"),
        tokensIn: sum(RunLogTable.tokensIn),
        tokensOut: sum(RunLogTable.tokensOut),
      })
      .from(RunLogTable)
      .where(and(...conds))
      .groupBy(sql`DATE(${RunLogTable.createdAt})`)
      .orderBy(sql`DATE(${RunLogTable.createdAt})`);

    return rows.map((r) => ({
      date: r.date,
      tokensIn: Number(r.tokensIn ?? 0),
      tokensOut: Number(r.tokensOut ?? 0),
    }));
  }

  /**
   * Run mode distribution: async vs sync vs stream.
   */
  async getRunModeDistribution(orgId: string, filters: AnalyticsFilters) {
    const conds = this.conditions(orgId, filters);

    const rows = await db
      .select({
        runMode: RunLogTable.runMode,
        count: count(),
      })
      .from(RunLogTable)
      .where(and(...conds))
      .groupBy(RunLogTable.runMode);

    return rows.map((r) => ({ runMode: r.runMode, count: Number(r.count) }));
  }
}
