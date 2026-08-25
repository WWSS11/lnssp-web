import { NextRequest, NextResponse } from "next/server";
import { getRule, updateRule } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string; versionId: string }> },
) {
  try {
    const { ruleId, versionId } = await params;
    const version = parseInt(versionId, 10);
    const body = await req.json();

    const existing = await getRule(ruleId, version);
    if (!existing) {
      return NextResponse.json(
        { error: "Rule version not found" },
        { status: 404 },
      );
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft rules can be updated" },
        { status: 400 },
      );
    }

    const updated = await updateRule(existing.id, body);
    return NextResponse.json({ rule: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update rule version" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string; versionId: string }> },
) {
  try {
    const { ruleId, versionId } = await params;
    const version = parseInt(versionId, 10);
    const body = await req.json();
    const { action } = body;

    if (action !== "validate") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const existing = await getRule(ruleId, version);
    if (!existing) {
      return NextResponse.json(
        { error: "Rule version not found" },
        { status: 404 },
      );
    }

    // Validate schema: check required fields
    const decisionTable = existing.decisionTable as Record<string, unknown>;
    const schemaValid =
      existing.ruleId && existing.name && decisionTable?.rows !== undefined;

    // Validate examples
    const examples = (existing.examples as unknown[]) ?? [];
    const examplesValid = examples.length > 0;

    const results = {
      schema_valid: schemaValid,
      examples_valid: examplesValid,
      examples_count: examples.length,
    };

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to validate rule version" },
      { status: 500 },
    );
  }
}
