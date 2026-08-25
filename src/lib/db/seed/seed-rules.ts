import fs from "fs";
import path from "path";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/lib/db";
import { rules, tests } from "@/lib/db/schema";
import { eq, desc, notInArray } from "drizzle-orm";

const RULES_DIR = path.join(process.cwd(), "dsl/ssp_dsl_v1/rules");
const LIAONING_RULE_SET_FILE = path.join(
  process.cwd(),
  "dsl/ssp_dsl_v1/rule_sets/rule_set_liaoning_plan_v1.json",
);
const allowPublishedBootstrap =
  process.env.POLICY_SEED_ALLOW_PUBLISHED === "true";

function loadProductionRuleIds(): Set<string> {
  const ruleSet = JSON.parse(
    fs.readFileSync(LIAONING_RULE_SET_FILE, "utf-8"),
  ) as { rule_set_id?: string; status?: string; rules?: string[] };
  if (
    ruleSet.rule_set_id !== "RS-LIAONING-PLAN-V1" ||
    ruleSet.status !== "published"
  ) {
    throw new Error("辽宁生产规则集缺失或未发布");
  }
  return new Set(ruleSet.rules ?? []);
}

interface RuleFile {
  dsl_version: string;
  rule_id: string;
  name: string;
  module?: string;
  status: string;
  priority: number;
  effective_from: string;
  effective_to?: string | null;
  supersedes?: string[];
  notes?: string;
  inputs: unknown[];
  parameter_refs: unknown[];
  decision_table: unknown;
  outputs: unknown[];
  examples: unknown[];
  evidence?: unknown[];
}

export async function seedRules() {
  const productionRuleIds = loadProductionRuleIds();
  const files = fs
    .readdirSync(RULES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const fileRuleIds = new Set(
    files.map((file) => {
      const rule = JSON.parse(
        fs.readFileSync(path.join(RULES_DIR, file), "utf-8"),
      ) as Pick<RuleFile, "rule_id">;
      return rule.rule_id;
    }),
  );
  const missingRuleFiles = [...productionRuleIds].filter(
    (ruleId) => !fileRuleIds.has(ruleId),
  );
  const extraRuleFiles = [...fileRuleIds].filter(
    (ruleId) => !productionRuleIds.has(ruleId),
  );

  if (missingRuleFiles.length > 0 || extraRuleFiles.length > 0) {
    throw new Error(
      `辽宁规则文件与生产规则集不一致：缺少 [${missingRuleFiles.join(", ")}]，多余 [${extraRuleFiles.join(", ")}]`,
    );
  }

  const activeRuleIds = [...productionRuleIds];
  await db.delete(tests).where(notInArray(tests.ruleId, activeRuleIds));
  await db.delete(rules).where(notInArray(rules.ruleId, activeRuleIds));

  console.log(`Seeding ${files.length} Liaoning rules...`);

  for (const file of files) {
    const filePath = path.join(RULES_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const rule: RuleFile = JSON.parse(raw);

    const existing = await db
      .select()
      .from(rules)
      .where(eq(rules.ruleId, rule.rule_id))
      .orderBy(desc(rules.version))
      .limit(1);

    const data = {
      ruleId: rule.rule_id,
      name: rule.name,
      module: rule.module ?? "",
      dslVersion: rule.dsl_version,
      priority: rule.priority,
      status:
        rule.status === "published" && !allowPublishedBootstrap
          ? "draft"
          : rule.status,
      effectiveFrom: rule.effective_from,
      effectiveTo: rule.effective_to ?? null,
      supersedes: rule.supersedes ?? [],
      inputs: rule.inputs,
      parameterRefs: rule.parameter_refs,
      decisionTable: rule.decision_table as Record<string, unknown>,
      outputs: rule.outputs,
      examples: rule.examples,
      evidence: rule.evidence ?? [],
      notes: rule.notes ?? null,
      version: (existing[0]?.version ?? 0) + 1,
    };

    if (!existing[0] || !sameSeededRule(existing[0], data)) {
      await db.insert(rules).values(data);
      console.log(`  Inserted rule version ${data.version}: ${rule.rule_id}`);
    } else {
      console.log(`  Unchanged rule: ${rule.rule_id}`);
    }
  }

  console.log("Rules seeded.");
}

function sameSeededRule(
  existing: typeof rules.$inferSelect,
  next: Omit<typeof rules.$inferInsert, "id" | "createdAt" | "updatedAt">,
): boolean {
  return (
    existing.name === next.name &&
    existing.module === next.module &&
    existing.dslVersion === next.dslVersion &&
    existing.priority === next.priority &&
    seedStatusesEquivalent(existing.status, String(next.status)) &&
    existing.effectiveFrom === next.effectiveFrom &&
    existing.effectiveTo === next.effectiveTo &&
    isDeepStrictEqual(existing.supersedes, next.supersedes) &&
    isDeepStrictEqual(existing.inputs, next.inputs) &&
    isDeepStrictEqual(existing.parameterRefs, next.parameterRefs) &&
    isDeepStrictEqual(existing.decisionTable, next.decisionTable) &&
    isDeepStrictEqual(existing.outputs, next.outputs) &&
    isDeepStrictEqual(existing.examples, next.examples) &&
    isDeepStrictEqual(existing.evidence, next.evidence) &&
    existing.notes === next.notes
  );
}

function seedStatusesEquivalent(existing: string, next: string): boolean {
  return existing === next || (existing === "published" && next === "draft");
}
