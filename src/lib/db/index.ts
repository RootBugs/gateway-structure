/**
 * Supabase Query Adapter — Prisma-compatible API surface
 *
 * Maps common Prisma query patterns to Supabase SQL operations.
 * Existing code only needs `import { db } from "@/lib/db"` instead of
 * `import { prisma } from "@/lib/db/prisma"`.
 */

import { supabase } from "./supabase";
import logger from "@/lib/logger";

// ============================================================================
// Table name mapping (Prisma model → Supabase table)
// ============================================================================

const TABLE_MAP: Record<string, string> = {
  user: "users",
  apiKey: "api_keys",
  session: "sessions",
  conversation: "conversations",
  provider: "providers",
  providerHealth: "provider_health",
  providerUsage: "provider_usage",
  providerQuotaState: "provider_quota_state",
  requestLog: "request_logs",
  rateLimit: "rate_limits",
  modelAlias: "model_aliases",
};

function getTable(model: string): string {
  return TABLE_MAP[model] || model;
}

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;
type WhereClause = Record<string, unknown>;

/** Convert a Supabase select query (already has .select("*")) and apply filters */
function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  where: WhereClause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let q = query;

  for (const [key, value] of Object.entries(where)) {
    if (value === null) {
      q = q.is(key, null);
    } else if (value === undefined) {
      // skip
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      for (const [op, opVal] of Object.entries(ops)) {
        switch (op) {
          case "gte":
            q = q.gte(key, opVal);
            break;
          case "lte":
            q = q.lte(key, opVal);
            break;
          case "gt":
            q = q.gt(key, opVal);
            break;
          case "lt":
            q = q.lt(key, opVal);
            break;
          case "in":
            q = q.in(key, opVal as unknown[]);
            break;
          case "not":
            q = q.neq(key, opVal);
            break;
          case "contains":
            q = q.ilike(key, `%${opVal}%`);
            break;
          default:
            q = q.eq(key, opVal);
        }
      }
    } else if (Array.isArray(value)) {
      q = q.in(key, value);
    } else {
      q = q.eq(key, value);
    }
  }

  return q;
}

// ============================================================================
// Relation Resolution
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RELATIONS: Record<string, Record<string, { table: string; localKey: string; foreignKey: string; many?: boolean }>> = {
  apiKey: {
    user: { table: "users", localKey: "user_id", foreignKey: "id" },
    requestLogs: { table: "request_logs", localKey: "id", foreignKey: "api_key_id", many: true },
    rateLimits: { table: "rate_limits", localKey: "id", foreignKey: "api_key_id", many: true },
  },
  session: {
    user: { table: "users", localKey: "user_id", foreignKey: "id" },
  },
  conversation: {
    user: { table: "users", localKey: "user_id", foreignKey: "id" },
  },
  providerHealth: {
    provider: { table: "providers", localKey: "provider_id", foreignKey: "id" },
  },
  provider: {
    health: { table: "provider_health", localKey: "id", foreignKey: "provider_id" },
    usage: { table: "provider_usage", localKey: "id", foreignKey: "provider_id", many: true },
    quotaState: { table: "provider_quota_state", localKey: "id", foreignKey: "provider_id" },
    requestLogs: { table: "request_logs", localKey: "id", foreignKey: "provider_id", many: true },
  },
  requestLog: {
    apiKey: { table: "api_keys", localKey: "api_key_id", foreignKey: "id" },
    provider: { table: "providers", localKey: "provider_id", foreignKey: "id" },
  },
  user: {
    apiKeys: { table: "api_keys", localKey: "id", foreignKey: "user_id", many: true },
    sessions: { table: "sessions", localKey: "id", foreignKey: "user_id", many: true },
    conversations: { table: "conversations", localKey: "id", foreignKey: "user_id", many: true },
  },
};

async function resolveRelation(
  parentModel: string,
  relation: string,
  parentRow: AnyRow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>
): Promise<unknown> {
  // Handle _count with select
  if (relation === "_count" && config?.select) {
    const countResult: Record<string, number> = {};
    const modelRelations = RELATIONS[parentModel];
    for (const [relName, enabled] of Object.entries(config.select)) {
      if (enabled && modelRelations?.[relName]) {
        const childRel = modelRelations[relName];
        const fkValue = parentRow[childRel.foreignKey];
        if (fkValue) {
          const { count } = await supabase
            .from(childRel.table)
            .select("*", { count: "exact", head: true })
            .eq(childRel.localKey, fkValue);
          countResult[relName] = count || 0;
        } else {
          countResult[relName] = 0;
        }
      }
    }
    return countResult;
  }

  const modelRelations = RELATIONS[parentModel];
  const rel = modelRelations?.[relation];
  if (!rel) return null;

  const fkValue = parentRow[rel.foreignKey];
  if (!fkValue) return rel.many ? [] : null;

  if (rel.many) {
    const { data } = await supabase.from(rel.table).select("*").eq(rel.localKey, fkValue);
    return data || [];
  } else {
    const { data } = await supabase.from(rel.table).select("*").eq(rel.localKey, fkValue).maybeSingle();
    return data || null;
  }
}

// ============================================================================
// Query Builder
// ============================================================================

class QueryBuilder {
  private model: string;
  private tableName: string;

  constructor(model: string) {
    this.model = model;
    this.tableName = getTable(model);
  }

  async findUnique(opts: { where: WhereClause; include?: Record<string, unknown>; select?: Record<string, unknown> }): Promise<AnyRow | null> {
    const query = supabase.from(this.tableName).select("*");
    const filtered = applyFilters(query, opts.where);
    const { data, error } = await filtered.limit(1).maybeSingle();
    if (error) {
      logger.error({ table: this.tableName, error: error.message }, "findUnique failed");
      return null;
    }
    if (!data) return null;
    if (opts.include) return this.resolveIncludes(data, opts.include);
    return data;
  }

  async findFirst(opts: { where?: WhereClause; orderBy?: Record<string, string>; include?: Record<string, unknown>; select?: Record<string, unknown> }): Promise<AnyRow | null> {
    const query = supabase.from(this.tableName).select("*");
    let filtered = opts.where ? applyFilters(query, opts.where) : query;

    if (opts.orderBy) {
      for (const [col, dir] of Object.entries(opts.orderBy)) {
        filtered = filtered.order(col, { ascending: dir === "asc" });
      }
    }

    const { data, error } = await filtered.limit(1).maybeSingle();
    if (error) {
      logger.error({ table: this.tableName, error: error.message }, "findFirst failed");
      return null;
    }
    if (!data) return null;
    if (opts.include) return this.resolveIncludes(data, opts.include);
    return data;
  }

  async findMany(opts: {
    where?: WhereClause;
    orderBy?: Record<string, string>;
    take?: number;
    skip?: number;
    include?: Record<string, unknown>;
    select?: Record<string, unknown>;
  }): Promise<AnyRow[]> {
    const query = supabase.from(this.tableName).select("*");
    let filtered = opts.where ? applyFilters(query, opts.where) : query;

    if (opts.orderBy) {
      for (const [col, dir] of Object.entries(opts.orderBy)) {
        filtered = filtered.order(col, { ascending: dir === "asc" });
      }
    }

    if (opts.take) filtered = filtered.limit(opts.take);
    if (opts.skip) filtered = filtered.range(opts.skip, opts.skip + (opts.take || 50) - 1);

    const { data, error } = await filtered;
    if (error) {
      logger.error({ table: this.tableName, error: error.message }, "findMany failed");
      return [];
    }
    if (!data) return [];
    if (opts.include) {
      return Promise.all(data.map((row: AnyRow) => this.resolveIncludes(row, opts.include!)));
    }
    return data;
  }

  async create(opts: { data: Record<string, unknown> }): Promise<AnyRow> {
    const row = this.convertDates(opts.data);
    const { data, error } = await supabase
      .from(this.tableName)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      logger.error({ table: this.tableName, error: error.message }, "create failed");
      throw new Error(`create failed on ${this.tableName}: ${error.message}`);
    }
    return data;
  }

  async update(opts: { where: WhereClause; data: Record<string, unknown> }): Promise<AnyRow> {
    const updateData = await this.handleIncrements(opts.data);
    const converted = this.convertDates(updateData);
    const query = supabase.from(this.tableName).update(converted);
    const filtered = applyFilters(query, opts.where);
    const { data, error } = await filtered.select("*").single();

    if (error) {
      logger.error({ table: this.tableName, where: opts.where, error: error.message }, "update failed");
      throw new Error(`update failed on ${this.tableName}: ${error.message}`);
    }
    return data;
  }

  async upsert(opts: { where: WhereClause; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<AnyRow> {
    const findQuery = applyFilters(supabase.from(this.tableName).select("id"), opts.where);
    const { data: existing } = await findQuery.limit(1).maybeSingle();

    if (existing) {
      return this.update({ where: opts.where, data: opts.update });
    } else {
      return this.create({ data: opts.create });
    }
  }

  async deleteMany(opts: { where: WhereClause }): Promise<{ count: number }> {
    const query = supabase.from(this.tableName).delete();
    const filtered = applyFilters(query, opts.where);
    const { count, error } = await filtered;
    if (error) {
      logger.error({ table: this.tableName, error: error.message }, "deleteMany failed");
      throw new Error(`deleteMany failed on ${this.tableName}: ${error.message}`);
    }
    return { count: count || 0 };
  }

  async count(opts?: { where?: WhereClause }): Promise<number> {
    const query = supabase.from(this.tableName).select("*", { count: "exact", head: true });
    const filtered = opts?.where ? applyFilters(query, opts.where) : query;
    const { count, error } = await filtered;
    if (error) {
      logger.error({ table: this.tableName, error: error.message }, "count failed");
      return 0;
    }
    return count || 0;
  }

  async aggregate(opts: {
    where?: WhereClause;
    _count?: { _all?: boolean };
    _sum?: Record<string, boolean>;
    _avg?: Record<string, boolean>;
  }): Promise<AnyRow> {
    let query = supabase.from(this.tableName).select("*");
    if (opts.where) query = applyFilters(query, opts.where);

    const { data, error } = await query;
    if (error || !data) {
      logger.error({ table: this.tableName, error: error?.message }, "aggregate failed");
      return this.emptyAggregateResult(opts);
    }

    const result: AnyRow = {};

    if (opts._count) {
      result._count = { _all: data.length };
    }

    if (opts._sum) {
      const sumResult: Record<string, number> = {};
      for (const col of Object.keys(opts._sum)) {
        sumResult[col] = data.reduce((acc: number, row: AnyRow) => acc + (Number(row[col]) || 0), 0);
      }
      result._sum = sumResult;
    }

    if (opts._avg) {
      const avgResult: Record<string, number> = {};
      for (const col of Object.keys(opts._avg)) {
        avgResult[col] = data.length > 0
          ? Math.round(data.reduce((acc: number, row: AnyRow) => acc + (Number(row[col]) || 0), 0) / data.length)
          : 0;
      }
      result._avg = avgResult;
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private emptyAggregateResult(opts: {
    _count?: Record<string, boolean>;
    _sum?: Record<string, boolean>;
    _avg?: Record<string, boolean>;
  }): AnyRow {
    const result: AnyRow = {};
    if (opts._count) result._count = { _all: 0 };
    if (opts._sum) {
      const sum: Record<string, number> = {};
      for (const k of Object.keys(opts._sum)) sum[k] = 0;
      result._sum = sum;
    }
    if (opts._avg) {
      const avg: Record<string, number> = {};
      for (const k of Object.keys(opts._avg)) avg[k] = 0;
      result._avg = avg;
    }
    return result;
  }

  private async handleIncrements(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        const ops = v as Record<string, unknown>;
        if ("increment" in ops) {
          const incrementBy = Number(ops.increment) || 0;
          if (incrementBy !== 0) {
            const { data: current } = await supabase
              .from(this.tableName)
              .select(k)
              .limit(1)
              .maybeSingle();
            const currentRow = current as AnyRow;
            const currentVal = currentRow ? Number(currentRow[k]) || 0 : 0;
            result[k] = currentVal + incrementBy;
          } else {
            result[k] = 0;
          }
        } else if (v instanceof Date) {
          result[k] = v.toISOString();
        } else {
          result[k] = v;
        }
      } else if (v instanceof Date) {
        result[k] = v.toISOString();
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  private convertDates(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v instanceof Date) result[k] = v.toISOString();
      else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        result[k] = this.convertDates(v as Record<string, unknown>);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  private async resolveIncludes(row: AnyRow, include: Record<string, unknown>): Promise<AnyRow> {
    const result = { ...row };
    for (const [relation, config] of Object.entries(include)) {
      if (config === true || typeof config === "object") {
        const resolved = await resolveRelation(this.model, relation, row, config as Record<string, unknown>);
        result[relation] = resolved;
      }
    }
    return result;
  }
}

// ============================================================================
// Database Interface
// ============================================================================

class Database {
  private builders = new Map<string, QueryBuilder>();

  private getBuilder(model: string): QueryBuilder {
    if (!this.builders.has(model)) {
      this.builders.set(model, new QueryBuilder(model));
    }
    return this.builders.get(model)!;
  }

  get user() { return this.getBuilder("user"); }
  get apiKey() { return this.getBuilder("apiKey"); }
  get session() { return this.getBuilder("session"); }
  get conversation() { return this.getBuilder("conversation"); }
  get provider() { return this.getBuilder("provider"); }
  get providerHealth() { return this.getBuilder("providerHealth"); }
  get providerUsage() { return this.getBuilder("providerUsage"); }
  get providerQuotaState() { return this.getBuilder("providerQuotaState"); }
  get requestLog() { return this.getBuilder("requestLog"); }
  get rateLimit() { return this.getBuilder("rateLimit"); }
  get modelAlias() { return this.getBuilder("modelAlias"); }
}

export const db = new Database();
