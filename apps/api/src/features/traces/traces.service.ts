import { db } from "@/db";
import { RunLogTable, type NewRunLog, type RunLog } from "@/db/run-log.schema";
import { and, eq, gte, lte, desc, count, sql } from "drizzle-orm";

export type CreateRunLogInput = Omit<NewRunLog, "id" | "createdAt">;

export interface ListRunsFilters {
  agentId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export class TracesService {
  /**
   * Persist a run log entry. Called from agent controllers after each run.
   * Intentionally fire-and-forget in practice — callers should not block on this.
   */
  async logRun(input: CreateRunLogInput): Promise<RunLog> {
    const [row] = await db.insert(RunLogTable).values(input).returning();
    return row;
  }

  /**
   * List run logs for an org, newest first.
   * Supports filtering by agent, status, and date range.
   */
  async listRuns(orgId: string, filters: ListRunsFilters = {}) {
    const {
      agentId,
      status,
      from,
      to,
      limit = 50,
      offset = 0,
    } = filters;

    const conditions = [eq(RunLogTable.orgId, orgId)];

    if (agentId) conditions.push(eq(RunLogTable.agentId, agentId));
    if (status) conditions.push(eq(RunLogTable.status, status as any));
    if (from) conditions.push(gte(RunLogTable.createdAt, from));
    if (to) conditions.push(lte(RunLogTable.createdAt, to));

    const rows = await db
      .select()
      .from(RunLogTable)
      .where(and(...conditions))
      .orderBy(desc(RunLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Total count for pagination (same filters, no paging)
    const [{ total }] = await db
      .select({ total: count() })
      .from(RunLogTable)
      .where(and(...conditions));

    return { runs: rows, total: Number(total) };
  }

  /**
   * Get a single run log by id (scoped to org for access control).
   */
  async getRun(orgId: string, id: string): Promise<RunLog | null> {
    const row = await db.query.RunLogTable.findFirst({
      where: and(eq(RunLogTable.id, id), eq(RunLogTable.orgId, orgId)),
    });
    return row ?? null;
  }
}
