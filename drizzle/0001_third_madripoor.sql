ALTER TABLE "params" ALTER COLUMN "applicable_province" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "params" ALTER COLUMN "applicable_province" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "params" ALTER COLUMN "availability" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "params" ALTER COLUMN "availability" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "params" ALTER COLUMN "review_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "params" ALTER COLUMN "review_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "params" ALTER COLUMN "confidence" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "params" ALTER COLUMN "confidence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "data_as_of" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "last_reviewed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "applicable_province" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "applicable_province" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "scope" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "scope" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "review_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "review_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "confidence" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ALTER COLUMN "confidence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "publishes" ALTER COLUMN "entity_row_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "publishes" ALTER COLUMN "entity_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "showcase_cases" ALTER COLUMN "province" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "showcase_cases" ALTER COLUMN "province" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "showcase_cases" ALTER COLUMN "city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "showcase_cases" ALTER COLUMN "review_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "showcase_cases" ALTER COLUMN "review_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "showcase_cases" ALTER COLUMN "policy_data_as_of" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "showcase_cases" ALTER COLUMN "official_sources" DROP NOT NULL;