import { NextRequest, NextResponse } from "next/server";
import { getRule, listRuleVersions, updateRule } from "@/lib/db/queries";
import { pickRuleDraftFields } from "@/lib/admin/editable-entity";

export const dynamic = "force-dynamic";

async function handleUpdate(
  req: NextRequest,
  params: Promise<{ ruleId: string }>,
) {
  try {
    const { ruleId } = await params;
    const body = pickRuleDraftFields(await req.json());

    const existing = await getRule(ruleId);
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft rules can be updated" },
        { status: 400 },
      );
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }
    const updated = await updateRule(existing.id, body);
    return NextResponse.json({ rule: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update rule" },
      { status: 500 },
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  try {
    const { ruleId } = await params;
    const rule = await getRule(ruleId);

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const versions = await listRuleVersions(ruleId);
    return NextResponse.json({ rule, versions });
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve rule" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  return handleUpdate(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  return handleUpdate(req, params);
}
