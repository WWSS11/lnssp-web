import * as XLSX from "xlsx";
import path from "path";
import { db } from "@/lib/db";
import { cases, tests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DATA_DIR = path.join(process.cwd(), "data");

interface CaseRow {
  case_uid?: string;
  creator?: string;
  post_date?: string;
  video_id?: string;
  topics?: string;
  case_text?: string;
  transcript_text?: string;
  tags?: string;
  is_regression?: string | boolean;
  [key: string]: unknown;
}

interface TestRow {
  name?: string;
  rule_id?: string;
  input?: string;
  params_override?: string;
  expected?: string;
  [key: string]: unknown;
}

function parseJsonField(val: unknown): unknown {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(String(val));
  } catch {
    return String(val);
  }
}

export async function importCases() {
  const filePath = path.join(
    DATA_DIR,
    "independent_cases_with_full_transcripts_v5.xlsx",
  );
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<CaseRow>(ws, { defval: null });

  console.log(`Importing ${rows.length} cases from Excel...`);

  for (const row of rows) {
    const caseUid = String(row.case_uid ?? "");
    if (!caseUid) continue;

    const existing = await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.caseUid, caseUid))
      .limit(1);

    const isRegression =
      row.is_regression === true ||
      row.is_regression === "true" ||
      row.is_regression === "1" ||
      String(row.is_regression) === "1";

    const data = {
      caseUid,
      creator: row.creator ? String(row.creator) : null,
      postDate: row.post_date ? String(row.post_date) : null,
      videoId: row.video_id ? String(row.video_id) : null,
      topics: parseJsonField(row.topics),
      caseText: row.case_text ? String(row.case_text) : null,
      transcriptText: row.transcript_text ? String(row.transcript_text) : null,
      tags: parseJsonField(row.tags),
      isRegression,
      sourceFile: "independent_cases_with_full_transcripts_v5.xlsx",
    };

    if (existing.length > 0) {
      await db
        .update(cases)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(cases.caseUid, caseUid));
    } else {
      await db.insert(cases).values(data);
    }
  }

  console.log(`Cases imported: ${rows.length}`);
}

export async function importRegressionTests() {
  const filePath = path.join(DATA_DIR, "runnable_testdata_from_cases_v5.xlsx");
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<TestRow>(ws, { defval: null });

  console.log(`Importing ${rows.length} regression tests from Excel...`);

  for (const row of rows) {
    const testName = String(row.name ?? "");
    if (!testName) continue;

    const existing = await db
      .select({ id: tests.id })
      .from(tests)
      .where(eq(tests.name, testName))
      .limit(1);

    const inputParsed = parseJsonField(row.input);
    const expectedParsed = parseJsonField(row.expected);

    if (!inputParsed || !expectedParsed) {
      console.warn(`  Skipping test with missing input/expected: ${testName}`);
      continue;
    }

    const data = {
      name: testName,
      ruleId: row.rule_id ? String(row.rule_id) : null,
      input: inputParsed as Record<string, unknown>,
      paramsOverride: parseJsonField(row.params_override),
      expected: expectedParsed as Record<string, unknown>,
      source: "regression",
    };

    if (existing.length > 0) {
      await db
        .update(tests)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tests.name, testName));
    } else {
      await db.insert(tests).values(data);
    }
  }

  console.log(`Regression tests imported: ${rows.length}`);
}
