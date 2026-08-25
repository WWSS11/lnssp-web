import fs from "fs";
import path from "path";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/lib/db";
import { ruleSets, workflows, tests } from "@/lib/db/schema";
import { and, desc, eq, ne, notInArray } from "drizzle-orm";

const DSL_DIR = path.join(process.cwd(), "dsl/ssp_dsl_v1");
const LIAONING_RULE_SET_FILE = "rule_set_liaoning_plan_v1.json";
const LIAONING_RULE_SET_ID = "RS-LIAONING-PLAN-V1";
const allowPublishedBootstrap =
  process.env.POLICY_SEED_ALLOW_PUBLISHED === "true";

interface RuleSetFile {
  rule_set_id: string;
  description?: string;
  status: string;
  effective_from: string;
  rules: string[];
  conflict_resolution?: unknown;
}

interface WorkflowFile {
  workflow_id: string;
  name: string;
  version: string;
  stages: unknown[];
  rollback_policy?: unknown;
  canary?: unknown;
  audit?: unknown;
}

interface TestEntry {
  rule_id: string;
  example_name: string;
  input: unknown;
  params_override?: unknown;
  expected: unknown;
}

interface TestsFile {
  tests: TestEntry[];
}

export async function seedMisc() {
  // 当前项目仅维护辽宁规则集。
  const ruleSetsDir = path.join(DSL_DIR, "rule_sets");
  const ruleSetFiles = fs
    .readdirSync(ruleSetsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  if (
    ruleSetFiles.length !== 1 ||
    ruleSetFiles[0] !== LIAONING_RULE_SET_FILE
  ) {
    throw new Error("规则集目录只能包含辽宁生产规则集");
  }

  await db
    .delete(ruleSets)
    .where(ne(ruleSets.ruleSetId, LIAONING_RULE_SET_ID));

  const productionRuleIds = new Set<string>();

  for (const file of ruleSetFiles) {
    const raw = fs.readFileSync(path.join(ruleSetsDir, file), "utf-8");
    const ruleSet = JSON.parse(raw) as RuleSetFile;
    await seedRuleSet(ruleSet);
    if (ruleSet.status === "published") {
      for (const ruleId of ruleSet.rules) productionRuleIds.add(ruleId);
    }
  }

  // Seed workflow
  const workflowPath = path.join(
    DSL_DIR,
    "workflows/publish_workflow_default.json",
  );
  const workflowRaw = fs.readFileSync(workflowPath, "utf-8");
  const workflow: WorkflowFile = JSON.parse(workflowRaw);

  console.log(`Seeding workflow: ${workflow.workflow_id}...`);

  const existingWorkflow = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.workflowId, workflow.workflow_id))
    .limit(1);

  const workflowData = {
    workflowId: workflow.workflow_id,
    name: workflow.name,
    versionStr: workflow.version,
    stages: workflow.stages,
    rollbackPolicy: workflow.rollback_policy ?? null,
    canary: workflow.canary ?? null,
    auditConfig: workflow.audit ?? null,
  };

  if (existingWorkflow.length > 0) {
    await db
      .update(workflows)
      .set({ ...workflowData, updatedAt: new Date() })
      .where(eq(workflows.workflowId, workflow.workflow_id));
    console.log(`  Updated workflow: ${workflow.workflow_id}`);
  } else {
    await db.insert(workflows).values(workflowData);
    console.log(`  Inserted workflow: ${workflow.workflow_id}`);
  }

  // Seed tests from rule examples
  const testsPath = path.join(DSL_DIR, "tests/rule_examples_as_tests.json");
  const testsRaw = fs.readFileSync(testsPath, "utf-8");
  const testsFile: TestsFile = JSON.parse(testsRaw);

  const productionTests = testsFile.tests.filter((test) =>
    productionRuleIds.has(test.rule_id),
  );
  console.log(`Seeding ${productionTests.length} production rule examples...`);

  const currentExampleNames = productionTests.map(
    (test) => `${test.rule_id}: ${test.example_name}`,
  );
  if (currentExampleNames.length > 0) {
    await db
      .delete(tests)
      .where(
        and(
          eq(tests.source, "example"),
          notInArray(tests.name, currentExampleNames),
        ),
      );
  }

  for (const t of productionTests) {
    const testName = `${t.rule_id}: ${t.example_name}`;

    const existingTest = await db
      .select({ id: tests.id })
      .from(tests)
      .where(eq(tests.name, testName))
      .limit(1);

    const testData = {
      name: testName,
      ruleId: t.rule_id,
      input: t.input as Record<string, unknown>,
      paramsOverride: t.params_override ?? null,
      expected: t.expected as Record<string, unknown>,
      source: "example",
    };

    if (existingTest.length > 0) {
      await db
        .update(tests)
        .set({ ...testData, updatedAt: new Date() })
        .where(eq(tests.name, testName));
      console.log(`  Updated test: ${testName}`);
    } else {
      await db.insert(tests).values(testData);
      console.log(`  Inserted test: ${testName}`);
    }
  }

  console.log("Misc seeded.");
}

async function seedRuleSet(ruleSet: RuleSetFile) {
  console.log(`Seeding rule set: ${ruleSet.rule_set_id}...`);

  const existingRuleSet = await db
    .select()
    .from(ruleSets)
    .where(eq(ruleSets.ruleSetId, ruleSet.rule_set_id))
    .orderBy(desc(ruleSets.version))
    .limit(1);

  const ruleSetData = {
    ruleSetId: ruleSet.rule_set_id,
    description: ruleSet.description ?? null,
    status:
      ruleSet.status === "published" && !allowPublishedBootstrap
        ? "draft"
        : ruleSet.status,
    effectiveFrom: ruleSet.effective_from,
    rules: ruleSet.rules,
    conflictResolution: ruleSet.conflict_resolution ?? null,
    version: (existingRuleSet[0]?.version ?? 0) + 1,
  };

  if (!existingRuleSet[0] || !sameSeededRuleSet(existingRuleSet[0], ruleSetData)) {
    await db.insert(ruleSets).values(ruleSetData);
    console.log(`  Inserted rule set version ${ruleSetData.version}: ${ruleSet.rule_set_id}`);
  } else {
    console.log(`  Unchanged rule set: ${ruleSet.rule_set_id}`);
  }
}

function sameSeededRuleSet(
  existing: typeof ruleSets.$inferSelect,
  next: Omit<typeof ruleSets.$inferInsert, "id" | "createdAt" | "updatedAt">,
): boolean {
  return (
    existing.description === next.description &&
    seedStatusesEquivalent(existing.status, String(next.status)) &&
    existing.effectiveFrom === next.effectiveFrom &&
    isDeepStrictEqual(existing.rules, next.rules) &&
    isDeepStrictEqual(existing.conflictResolution, next.conflictResolution)
  );
}

function seedStatusesEquivalent(existing: string, next: string): boolean {
  return existing === next || (existing === "published" && next === "draft");
}
