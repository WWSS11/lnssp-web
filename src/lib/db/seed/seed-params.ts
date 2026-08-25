import fs from "fs";
import path from "path";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/lib/db";
import { params, policyPackVersions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

const PARAMS_DIR = path.join(process.cwd(), "dsl/ssp_dsl_v1/params");
const seedStatus =
  process.env.POLICY_SEED_ALLOW_PUBLISHED === "true" ? "published" : "draft";

interface ScalarParamEntry {
  param_id: string;
  type: "number" | "boolean" | "string" | "array";
  value: unknown;
  unit?: string;
  effective_from?: string;
  effective_to?: string | null;
  source?: string;
  note?: string;
  availability?: string;
  reviewed_at?: string;
  confidence?: string;
}

interface TableParamEntry {
  param_id: string;
  type: "table" | "timeline";
  effective_from?: string;
  effective_to?: string | null;
  key_fields: string[];
  value_fields: string[];
  rows: unknown[];
  note?: string;
  source?: string;
  availability?: string;
  reviewed_at?: string;
  confidence?: string;
}

interface PolicyPackFile {
  policy_pack_id: string;
  as_of: string;
  policy_data_as_of: string;
  last_reviewed_at: string;
  review_due_at?: string;
  applicable_province?: string;
  applicable_city?: string | null;
  scope?: string;
  review_status?: string;
  confidence?: string;
  params: ScalarParamEntry[];
  tables: TableParamEntry[];
}

export async function seedParams() {
  const files = fs
    .readdirSync(PARAMS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(PARAMS_DIR, file), "utf-8");
    const pack: PolicyPackFile = JSON.parse(raw);
    await seedPolicyPack(pack);
  }

  console.log("Params seeded.");
}

async function seedPolicyPack(pack: PolicyPackFile) {
  const policyPackId = pack.policy_pack_id;

  console.log(`Seeding params for policy pack: ${policyPackId}...`);

  // Seed scalar params
  for (const p of pack.params) {
    const existing = await db
      .select()
      .from(params)
      .where(
        and(
          eq(params.paramId, p.param_id),
          eq(params.policyPackId, policyPackId),
        ),
      )
      .orderBy(desc(params.version))
      .limit(1);

    const data = {
      policyPackId,
      paramId: p.param_id,
      type: p.type,
      value: p.value,
      unit: p.unit ?? null,
      effectiveFrom: p.effective_from ?? pack.as_of,
      effectiveTo: p.effective_to ?? null,
      source: p.source ?? null,
      keyFields: null,
      valueFields: null,
      rows: null,
      note: p.note ?? null,
      applicableProvince: pack.applicable_province ?? "辽宁省",
      applicableCity: pack.applicable_city ?? null,
      insuranceType: inferInsuranceType(p.param_id),
      availability: p.availability ?? "current",
      reviewedAt: p.reviewed_at ?? pack.last_reviewed_at,
      reviewStatus: pack.review_status ?? "approved",
      confidence: p.confidence ?? pack.confidence ?? "high",
      version: (existing[0]?.version ?? 0) + 1,
      status: seedStatus,
    };

    if (!existing[0] || !sameSeededParam(existing[0], data)) {
      await db.insert(params).values(data);
      console.log(`  Inserted param version ${data.version}: ${p.param_id}`);
    } else {
      console.log(`  Unchanged param: ${p.param_id}`);
    }
  }

  // Seed table params
  for (const t of pack.tables) {
    const existing = await db
      .select()
      .from(params)
      .where(
        and(
          eq(params.paramId, t.param_id),
          eq(params.policyPackId, policyPackId),
        ),
      )
      .orderBy(desc(params.version))
      .limit(1);

    const data = {
      policyPackId,
      paramId: t.param_id,
      type: t.type,
      value: null,
      unit: null,
      effectiveFrom: t.effective_from ?? pack.as_of,
      effectiveTo: t.effective_to ?? null,
      source: t.source ?? null,
      keyFields: t.key_fields,
      valueFields: t.value_fields,
      rows: t.rows,
      note: t.note ?? null,
      applicableProvince: pack.applicable_province ?? "辽宁省",
      applicableCity: pack.applicable_city ?? null,
      insuranceType: inferInsuranceType(t.param_id),
      availability: t.availability ?? "current",
      reviewedAt: t.reviewed_at ?? pack.last_reviewed_at,
      reviewStatus: pack.review_status ?? "approved",
      confidence: t.confidence ?? pack.confidence ?? "high",
      version: (existing[0]?.version ?? 0) + 1,
      status: seedStatus,
    };

    if (!existing[0] || !sameSeededParam(existing[0], data)) {
      await db.insert(params).values(data);
      console.log(`  Inserted table param version ${data.version}: ${t.param_id}`);
    } else {
      console.log(`  Unchanged table param: ${t.param_id}`);
    }
  }

  const existingVersions = await db
    .select()
    .from(policyPackVersions)
    .where(eq(policyPackVersions.policyPackId, policyPackId))
    .orderBy(desc(policyPackVersions.version))
    .limit(1);
  const latest = existingVersions[0];
  if (!latest || !isDeepStrictEqual(latest.paramSnapshot, pack)) {
    await db.insert(policyPackVersions).values({
      policyPackId,
      version: (latest?.version ?? 0) + 1,
      paramSnapshot: pack,
      status: seedStatus,
      effectiveFrom: pack.as_of,
      dataAsOf: pack.policy_data_as_of,
      lastReviewedAt: pack.last_reviewed_at,
      reviewDueAt: pack.review_due_at ?? null,
      applicableProvince: pack.applicable_province ?? "辽宁省",
      applicableCity: pack.applicable_city ?? null,
      scope: pack.scope ?? "province",
      reviewStatus: pack.review_status ?? "approved",
      confidence: pack.confidence ?? "high",
    });
  }

  console.log(`Policy pack seeded: ${policyPackId}.`);
}

function sameSeededParam(
  existing: typeof params.$inferSelect,
  next: Omit<typeof params.$inferInsert, "id" | "createdAt" | "updatedAt">,
): boolean {
  return (
    existing.policyPackId === next.policyPackId &&
    existing.paramId === next.paramId &&
    existing.type === next.type &&
    isDeepStrictEqual(existing.value, next.value) &&
    existing.unit === next.unit &&
    existing.effectiveFrom === next.effectiveFrom &&
    existing.effectiveTo === next.effectiveTo &&
    existing.source === next.source &&
    isDeepStrictEqual(existing.keyFields, next.keyFields) &&
    isDeepStrictEqual(existing.valueFields, next.valueFields) &&
    isDeepStrictEqual(existing.rows, next.rows) &&
    existing.note === next.note &&
    existing.applicableProvince === next.applicableProvince &&
    existing.applicableCity === next.applicableCity &&
    existing.insuranceType === next.insuranceType &&
    existing.availability === next.availability &&
    existing.reviewedAt === next.reviewedAt &&
    existing.reviewStatus === next.reviewStatus &&
    existing.confidence === next.confidence &&
    seedStatusesEquivalent(existing.status, String(next.status))
  );
}

function inferInsuranceType(paramId: string): string | null {
  if (paramId.includes("PENSION") || paramId.includes("RETIRE")) return "pension";
  if (paramId.includes("MEDICAL")) return "medical";
  if (paramId.includes("UNEMPLOYMENT") || paramId.includes("UI-")) return "unemployment";
  if (paramId.includes("SUBSIDY") || paramId.includes("MIN-WAGE")) return "employment";
  return null;
}

function seedStatusesEquivalent(existing: string, next: string): boolean {
  return existing === next || (existing === "published" && next === "draft");
}
