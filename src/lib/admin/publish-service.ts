import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, publishes, ruleSets, rules } from "@/lib/db/schema";
import { getRule, insertPublish, listTests } from "@/lib/db/queries";
import { validateRuleAgainstSchema } from "@/lib/dsl/schema-validator";
import { runDbTestSuite, dbRuleToDefinition } from "@/lib/engine/test-runner";
import { resolveParamRecord, validateParamRecord } from "./params-service";

export type PublishEntityType = "rule" | "param" | "rule_set";
export type PublishStage = "draft" | "staging" | "production";

interface GateCheckResult {
  passed: boolean;
  reason?: string;
  results: Record<string, unknown>;
}

interface LatestEntity {
  entityType: PublishEntityType;
  entityId: string;
  rowId: number;
  version: number;
  status: string;
}

async function loadStagingPolicyBundle(): Promise<{
  overrideRules: ReturnType<typeof dbRuleToDefinition>[];
  overrideParams: Record<string, unknown>;
  overrideRuleOrder?: string[];
}> {
  const [stagedRules, stagedParams, stagedRuleSets] = await Promise.all([
    db.select().from(rules).where(eq(rules.status, "staging")).orderBy(desc(rules.version)),
    db.select().from(params).where(eq(params.status, "staging")).orderBy(desc(params.version)),
    db.select().from(ruleSets).where(eq(ruleSets.status, "staging")).orderBy(desc(ruleSets.version)),
  ]);

  const latestRules = new Map<string, (typeof stagedRules)[number]>();
  for (const row of stagedRules) {
    if (!latestRules.has(row.ruleId)) latestRules.set(row.ruleId, row);
  }
  const latestParams = new Map<string, (typeof stagedParams)[number]>();
  for (const row of stagedParams) {
    if (!latestParams.has(row.paramId)) latestParams.set(row.paramId, row);
  }

  const overrideParams = Object.fromEntries(
    [...latestParams.values()].map((row) => [
      row.paramId,
      row.type === "table" || row.type === "timeline" ? row.rows ?? [] : row.value,
    ]),
  );
  const ruleSet = stagedRuleSets[0];

  return {
    overrideRules: [...latestRules.values()].map(dbRuleToDefinition),
    overrideParams,
    overrideRuleOrder: Array.isArray(ruleSet?.rules)
      ? (ruleSet.rules as string[])
      : undefined,
  };
}

export class PublishServiceError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function normalizeStageInput(stage: string | undefined): PublishStage | null {
  if (!stage) return null;
  if (stage === "draft") return "draft";
  if (stage === "staging") return "staging";
  if (stage === "prod" || stage === "production") return "production";
  return null;
}

export function hasDistinctAuthenticatedReviewer(
  stagingActor: string | null | undefined,
  productionActor: string,
): boolean {
  return Boolean(stagingActor && stagingActor !== productionActor);
}

function stageFromStatus(status: string): PublishStage | null {
  if (status === "published") return "production";
  if (status === "staging") return "staging";
  if (status === "draft") return "draft";
  return null;
}

function statusFromStage(stage: PublishStage): string {
  if (stage === "production") return "published";
  return stage;
}

async function getLatestEntity(
  entityType: PublishEntityType,
  entityId: string,
): Promise<LatestEntity | null> {
  if (entityType === "rule") {
    const rows = await db
      .select({ id: rules.id, status: rules.status, ruleId: rules.ruleId, version: rules.version })
      .from(rules)
      .where(eq(rules.ruleId, entityId))
      .orderBy(desc(rules.version))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      entityType,
      entityId: row.ruleId,
      rowId: row.id,
      version: row.version,
      status: row.status,
    };
  }

  if (entityType === "param") {
    const rows = await db
      .select({ id: params.id, status: params.status, paramId: params.paramId, version: params.version })
      .from(params)
      .where(eq(params.paramId, entityId))
      .orderBy(desc(params.version))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      entityType,
      entityId: row.paramId,
      rowId: row.id,
      version: row.version,
      status: row.status,
    };
  }

  const rows = await db
    .select({
      id: ruleSets.id,
      status: ruleSets.status,
      ruleSetId: ruleSets.ruleSetId,
      version: ruleSets.version,
    })
    .from(ruleSets)
    .where(eq(ruleSets.ruleSetId, entityId))
    .orderBy(desc(ruleSets.version))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    entityType,
    entityId: row.ruleSetId,
    rowId: row.id,
    version: row.version,
    status: row.status,
  };
}

async function updateEntityStatus(
  entityType: PublishEntityType,
  rowId: number,
  status: string,
): Promise<void> {
  if (entityType === "rule") {
    await db.update(rules).set({ status }).where(eq(rules.id, rowId));
    return;
  }

  if (entityType === "param") {
    await db.update(params).set({ status }).where(eq(params.id, rowId));
    return;
  }

  await db.update(ruleSets).set({ status }).where(eq(ruleSets.id, rowId));
}

async function checkPromoteGates(
  entityType: PublishEntityType,
  entityId: string,
  fromStage: PublishStage,
  toStage: PublishStage,
  actor: string,
  entityRowId: number,
  entityVersion: number,
): Promise<GateCheckResult> {
  if (fromStage === "draft" && toStage === "staging") {
    if (entityType === "param") {
      const param = await resolveParamRecord(entityId);
      if (!param) {
        return { passed: false, reason: "Param not found", results: {} };
      }
      const validation = validateParamRecord(param);
      return {
        passed: validation.valid,
        reason: validation.valid ? undefined : "Param validation failed",
        results: validation,
      };
    }

    if (entityType !== "rule") {
      return {
        passed: true,
        results: {
          checks: [{ name: "draft_to_staging", passed: true }],
        },
      };
    }

    const rule = await getRule(entityId);
    if (!rule) {
      return {
        passed: false,
        reason: "Rule not found",
        results: { checks: [{ name: "rule_exists", passed: false }] },
      };
    }

    const examples = (rule.examples as unknown[]) ?? [];
    // 用 ajv + 完整 DSL JSON-Schema 做结构校验（替代此前仅检查 ruleId/name/rows 的浅检查）。
    const schemaResult = validateRuleAgainstSchema(rule);
    const schemaValid = schemaResult.valid;
    const examplesValid = examples.length > 0;

    if (!schemaValid || !examplesValid) {
      return {
        passed: false,
        reason: schemaValid
          ? "Examples check failed"
          : `Schema validation failed: ${schemaResult.errors.slice(0, 3).join("; ")}`,
        results: {
          checks: [
            {
              name: "schema",
              passed: schemaValid,
              detail: schemaResult.errors.slice(0, 5).join("; ") || undefined,
            },
            { name: "examples", passed: examplesValid },
          ],
          schema_valid: schemaValid,
          schema_errors: schemaResult.errors.slice(0, 10),
          examples_valid: examplesValid,
        },
      };
    }

    return {
      passed: true,
      results: {
        checks: [
          { name: "schema", passed: true },
          { name: "examples", passed: true },
        ],
      },
    };
  }

  if (fromStage === "staging" && toStage === "production") {
    const priorReview = await db
      .select({ actor: publishes.actor })
      .from(publishes)
      .where(
        and(
          eq(publishes.entityType, entityType),
          eq(publishes.entityId, entityId),
          eq(publishes.entityRowId, entityRowId),
          eq(publishes.entityVersion, entityVersion),
          eq(publishes.toStage, "staging"),
        ),
      )
      .orderBy(desc(publishes.createdAt))
      .limit(1);
    if (!hasDistinctAuthenticatedReviewer(priorReview[0]?.actor, actor)) {
      return {
        passed: false,
        reason: priorReview[0]
          ? "Production promotion requires a second reviewer"
          : "Staging review record not found",
        results: {
          checks: [
            {
              name: "dual_review",
              passed: false,
              detail: "staging 与 production 必须由不同复核人操作",
            },
          ],
        },
      };
    }
    const tests = await listTests();

    const total = tests.length;
    if (total === 0) {
      return {
        passed: false,
        reason: "No regression tests found",
        results: {
          checks: [{ name: "regression", passed: false, detail: "no tests" }],
          total: 0,
          passed: 0,
          pass_rate: 0,
        },
      };
    }

    // 将全部 staging 规则、参数和规则集顺序作为一个候选 bundle 叠加后运行全量回归，
    // 避免任何一类待发布数据被旧 published 版本替代。
    const stagingBundle = await loadStagingPolicyBundle();

    // 重新真实跑一遍回归测试，不信任可能已过期的 lastRunResult。
    let suite: Awaited<ReturnType<typeof runDbTestSuite>>;
    try {
      suite = await runDbTestSuite(
        tests.map((test) => ({
          ruleId: test.ruleId,
          name: test.name,
          input: test.input as Record<string, unknown>,
          paramsOverride: test.paramsOverride as Record<string, unknown> | null,
          expected: test.expected as Record<string, unknown>,
        })),
        stagingBundle,
      );
    } catch (err) {
      return {
        passed: false,
        reason: `Regression run failed: ${err instanceof Error ? err.message : String(err)}`,
        results: {
          checks: [{ name: "regression", passed: false, detail: "run error" }],
          total,
          passed: 0,
          pass_rate: 0,
        },
      };
    }

    const passed = suite.passed;
    const passRate = suite.pass_rate;
    const failedNames = suite.results
      .filter((r) => !r.pass)
      .map((r) => r.name);

    if (passRate !== 1) {
      return {
        passed: false,
        reason: `Policy regression requires 100% pass rate; actual ${(passRate * 100).toFixed(1)}%`,
        results: {
          checks: [
            {
              name: "regression",
              passed: false,
              detail: `pass rate ${(passRate * 100).toFixed(1)}% < 100%`,
            },
          ],
          total,
          passed,
          pass_rate: passRate,
          failed_tests: failedNames.slice(0, 10),
        },
      };
    }

    return {
      passed: true,
      results: {
        checks: [
          {
            name: "regression",
            passed: true,
            detail: `pass rate ${(passRate * 100).toFixed(1)}% (re-run ${total} tests)`,
          },
        ],
        total,
        passed,
        pass_rate: passRate,
        failed_tests: failedNames.slice(0, 10),
      },
    };
  }

  return {
    passed: false,
    reason: "Unsupported stage transition",
    results: {
      checks: [{ name: "transition", passed: false }],
    },
  };
}

function nextStageFromCurrent(current: PublishStage): PublishStage | null {
  if (current === "draft") return "staging";
  if (current === "staging") return "production";
  return null;
}

export async function promoteEntity(options: {
  entityType: PublishEntityType;
  entityId: string;
  requestedToStage?: PublishStage | null;
  actor: string;
  reason?: string;
}) {
  const entity = await getLatestEntity(options.entityType, options.entityId);
  if (!entity) {
    throw new PublishServiceError(404, "Entity not found");
  }

  const fromStage = stageFromStatus(entity.status);
  if (!fromStage) {
    throw new PublishServiceError(
      400,
      `Unsupported entity status: ${entity.status}`,
    );
  }
  const allowedToStage = nextStageFromCurrent(fromStage);

  if (!allowedToStage) {
    throw new PublishServiceError(400, "Current stage cannot be promoted");
  }

  if (options.requestedToStage && options.requestedToStage !== allowedToStage) {
    throw new PublishServiceError(
      400,
      `Invalid target stage: expected ${allowedToStage}`,
    );
  }

  const gateCheck = await checkPromoteGates(
    options.entityType,
    entity.entityId,
    fromStage,
    allowedToStage,
    options.actor,
    entity.rowId,
    entity.version,
  );

  if (!gateCheck.passed) {
    throw new PublishServiceError(422, gateCheck.reason ?? "Gate check failed", {
      gateResults: {
        passed: false,
        ...gateCheck.results,
      },
    });
  }

  const newStatus = statusFromStage(allowedToStage);
  await updateEntityStatus(options.entityType, entity.rowId, newStatus);

  const publish = await insertPublish({
    entityType: options.entityType,
    entityId: entity.entityId,
    entityRowId: entity.rowId,
    entityVersion: entity.version,
    fromStage,
    toStage: allowedToStage,
    actor: options.actor,
    reason: options.reason ?? null,
    gateResults: gateCheck.results,
    diff: null,
  });

  return {
    fromStage,
    toStage: allowedToStage,
    newStatus,
    publish,
    gateResults: {
      passed: true,
      ...gateCheck.results,
    },
  };
}

export async function rollbackEntity(options: {
  entityType: PublishEntityType;
  entityId: string;
  actor: string;
  reason?: string;
}) {
  const entity = await getLatestEntity(options.entityType, options.entityId);
  if (!entity) {
    throw new PublishServiceError(404, "Entity not found");
  }

  const fromStage = stageFromStatus(entity.status);
  if (!fromStage) {
    throw new PublishServiceError(
      400,
      `Unsupported entity status: ${entity.status}`,
    );
  }
  if (fromStage !== "production") {
    throw new PublishServiceError(400, "Only production entities can rollback");
  }

  const toStage: PublishStage = "staging";
  await updateEntityStatus(options.entityType, entity.rowId, "staging");

  const publish = await insertPublish({
    entityType: options.entityType,
    entityId: entity.entityId,
    entityRowId: entity.rowId,
    entityVersion: entity.version,
    fromStage,
    toStage,
    actor: options.actor,
    reason: options.reason ?? "rollback",
    gateResults: { rollback: true },
    diff: null,
  });

  return {
    fromStage,
    toStage,
    publish,
  };
}
