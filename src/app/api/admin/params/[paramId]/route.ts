import { NextRequest, NextResponse } from "next/server";
import { updateParam } from "@/lib/db/queries";
import {
  resolveParamRecord,
  validateParamRecord,
} from "@/lib/admin/params-service";
import { pickParamDraftFields } from "@/lib/admin/editable-entity";

export const dynamic = "force-dynamic";

async function handleUpdate(
  req: NextRequest,
  routeParams: Promise<{ paramId: string }>,
) {
  try {
    const { paramId } = await routeParams;
    const body = pickParamDraftFields(await req.json());

    const existing = await resolveParamRecord(paramId);
    if (!existing) {
      return NextResponse.json({ error: "Param not found" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft params can be updated" },
        { status: 400 },
      );
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }
    const updated = await updateParam(existing.id, body);
    return NextResponse.json({ param: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update param" },
      { status: 500 },
    );
  }
}

async function handleValidate(routeParams: Promise<{ paramId: string }>) {
  try {
    const { paramId } = await routeParams;
    const existing = await resolveParamRecord(paramId);

    if (!existing) {
      return NextResponse.json({ error: "Param not found" }, { status: 404 });
    }

    const validation = validateParamRecord(existing);
    return NextResponse.json(validation);
  } catch {
    return NextResponse.json(
      { error: "Failed to validate param" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  return handleUpdate(req, routeParams);
}

export async function PATCH(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  return handleUpdate(req, routeParams);
}

export async function POST(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  try {
    let body: { action?: string } | null = null;
    try {
      body = (await req.json()) as { action?: string };
    } catch {
      body = null;
    }

    if (body?.action && body.action !== "validate") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return handleValidate(routeParams);
  } catch {
    return NextResponse.json(
      { error: "Failed to validate param" },
      { status: 500 },
    );
  }
}
