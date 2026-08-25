import { NextRequest, NextResponse } from "next/server";
import {
  normalizeStageInput,
  promoteEntity,
  PublishEntityType,
  PublishServiceError,
} from "@/lib/admin/publish-service";
import { getAuthenticatedActor } from "@/lib/admin/authenticated-actor";

export const dynamic = "force-dynamic";

interface PromoteRequest {
  entity_type?: PublishEntityType;
  entity_id?: string;
  to_stage?: string;
  reason?: string;

  entityType?: PublishEntityType;
  entityId?: string;
  toStage?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PromoteRequest;

    const entityType = body.entity_type ?? body.entityType;
    const entityId = body.entity_id ?? body.entityId;
    const requestedToStage = normalizeStageInput(body.to_stage ?? body.toStage);
    const actor = await getAuthenticatedActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if ((body.to_stage || body.toStage) && !requestedToStage) {
      return NextResponse.json(
        { error: "Invalid target stage" },
        { status: 400 },
      );
    }

    const result = await promoteEntity({
      entityType,
      entityId,
      requestedToStage,
      actor,
      reason: body.reason,
    });

    return NextResponse.json({
      success: true,
      publish: result.publish,
      gateResults: result.gateResults,
      fromStage: result.fromStage,
      toStage: result.toStage,
      newStatus: result.newStatus,
    });
  } catch (error) {
    if (error instanceof PublishServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.details && typeof error.details === "object"
            ? error.details
            : {}),
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Failed to promote entity" },
      { status: 500 },
    );
  }
}
