import { NextRequest, NextResponse } from "next/server";
import { listRules, insertRule } from "@/lib/db/queries";
import { rules } from "@/lib/db/schema";
import { pickRuleDraftFields } from "@/lib/admin/editable-entity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const ruleModule = searchParams.get("module") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const rules = await listRules({ module: ruleModule, status });
    return NextResponse.json({ rules });
  } catch {
    return NextResponse.json(
      { error: "Failed to list rules" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = pickRuleDraftFields(await req.json(), true);
    // New entities always start as draft; promotion to published goes through the
    // publish pipeline. Forcing status here stops a create from skipping that gate.
    const rule = await insertRule({
      ...(body as typeof rules.$inferInsert),
      version: 1,
      status: "draft",
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create rule" },
      { status: 500 },
    );
  }
}
