import "dotenv/config";

import { seedRules } from "./seed-rules";
import { seedParams } from "./seed-params";
import { seedMisc } from "./seed-misc";

async function main() {
  console.log("=== SSP Seed Runner ===");

  try {
    // Phase 1: Rules
    await seedRules();

    // Phase 2: Params
    await seedParams();

    // Phase 3: Rule sets, workflows, example tests
    await seedMisc();

    console.log("=== Seed complete ===");
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

main();
