import { NextRequest, NextResponse } from "next/server";
import { insertCases } from "@/lib/db/queries";
import * as XLSX from "xlsx";
import { validateApprovedLiaoningImportRows } from "@/lib/import/liaoning-import-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rows: Record<string, unknown>[] = [];

    const filename = file.name.toLowerCase();
    if (filename.endsWith(".json")) {
      const text = buffer.toString("utf-8");
      const data = JSON.parse(text);
      rows = Array.isArray(data) ? data : [data];
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet);
    } else {
      return NextResponse.json(
        { error: "Unsupported file format. Use .json or .xlsx" },
        { status: 400 },
      );
    }

    const validation = validateApprovedLiaoningImportRows(rows);
    if (validation.issues.length > 0) {
      return NextResponse.json(
        { error: "导入被拒绝：仅允许已审核的辽宁地市数据", details: validation.issues },
        { status: 400 },
      );
    }

    const caseData = validation.normalized.map((row) => ({
      caseUid: (row.case_uid as string) ?? null,
      creator: (row.creator as string) ?? null,
      postDate: (row.post_date as string) ?? null,
      videoId: (row.video_id as string) ?? null,
      topics: (row.topics as unknown[]) ?? null,
      caseText: (row.case_text as string) ?? null,
      transcriptText: (row.transcript_text as string) ?? null,
      tags: (row.tags as unknown[]) ?? null,
      isRegression: Boolean(row.is_regression),
      sourceFile: file.name,
      province: row.province,
      city: row.city,
      reviewStatus: row.review_status,
    }));

    const inserted = await insertCases(caseData);
    return NextResponse.json({ inserted: inserted.length, cases: inserted });
  } catch {
    return NextResponse.json(
      { error: "Failed to import cases" },
      { status: 500 },
    );
  }
}
