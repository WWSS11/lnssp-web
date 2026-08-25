ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "applicable_province" text;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "applicable_city" text;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "insurance_type" text;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "availability" text;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "reviewed_at" date;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "review_status" text;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "confidence" text;
UPDATE "params"
SET "applicable_province" = COALESCE("applicable_province", '辽宁省'),
    "insurance_type" = COALESCE("insurance_type", CASE
      WHEN "param_id" LIKE '%PENSION%' OR "param_id" LIKE '%RETIRE%' THEN 'pension'
      WHEN "param_id" LIKE '%MEDICAL%' THEN 'medical'
      WHEN "param_id" LIKE '%UNEMPLOYMENT%' OR "param_id" LIKE '%UI-%' THEN 'unemployment'
      WHEN "param_id" LIKE '%SUBSIDY%' OR "param_id" LIKE '%MIN-WAGE%' THEN 'employment'
      ELSE NULL END),
    "availability" = COALESCE("availability", CASE
      WHEN "effective_to" IS NOT NULL AND "effective_to" <= DATE '2025-12-31'
        THEN 'historical_only' ELSE 'current' END),
    "reviewed_at" = COALESCE("reviewed_at", DATE '2026-08-20'),
    "review_status" = COALESCE("review_status", 'approved'),
    "confidence" = COALESCE("confidence", 'high')
WHERE "policy_pack_id" = 'LIAONING_BASE' AND "status" = 'published';
--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "data_as_of" date;
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "last_reviewed_at" date;
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "review_due_at" date;
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "applicable_province" text;
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "applicable_city" text;
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "scope" text;
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "review_status" text;
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "confidence" text;
INSERT INTO "policy_pack_versions"
  ("policy_pack_id", "version", "param_snapshot", "status", "effective_from",
   "data_as_of", "last_reviewed_at", "review_due_at", "applicable_province",
   "applicable_city", "scope", "review_status", "confidence")
SELECT 'LIAONING_BASE', versions.next_version, NULL, 'published', DATE '2026-08-20',
       DATE '2025-12-31', DATE '2026-08-20', DATE '2026-12-31', '辽宁省',
       NULL, 'province', 'approved', 'high'
FROM (
  SELECT COALESCE(MAX("version"), 0) + 1 AS next_version
  FROM "policy_pack_versions" WHERE "policy_pack_id" = 'LIAONING_BASE'
) AS versions
WHERE EXISTS (
  SELECT 1 FROM "params"
  WHERE "policy_pack_id" = 'LIAONING_BASE' AND "status" = 'published'
)
AND NOT EXISTS (
  SELECT 1 FROM "policy_pack_versions"
  WHERE "policy_pack_id" = 'LIAONING_BASE'
    AND "status" = 'published'
    AND "review_status" = 'approved'
    AND "data_as_of" IS NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publishes" ADD COLUMN IF NOT EXISTS "entity_row_id" integer;
ALTER TABLE "publishes" ADD COLUMN IF NOT EXISTS "entity_version" integer;
--> statement-breakpoint
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "province" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "review_status" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "reviewed_by" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "policy_data_as_of" date;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "official_sources" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "generated_by" text;
--> statement-breakpoint
-- 旧展示数据地区与审核状态未知，统一隔离但不删除，待人工核验补齐后再发布。
UPDATE "showcase_cases" SET "is_published" = false
WHERE "province" IS NULL OR "city" IS NULL OR "review_status" IS DISTINCT FROM 'approved';
ALTER TABLE "showcase_cases" ALTER COLUMN "is_published" SET DEFAULT false;
