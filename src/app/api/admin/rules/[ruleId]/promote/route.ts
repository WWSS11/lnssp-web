import { NextRequest, NextResponse } from "next/server";
import {
  normalizeStageInput,
  promoteEntity,
  PublishServiceError,
} from "@/lib/admin/publish-service";
import { getAuthenticatedActor } from "@/lib/admin/authenticated-actor";

export const dynamic = "force-dynamic";

interface PromoteBody {
  toStage?: string;
  to_stage?: string;
  reason?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  try {
    const { ruleId } = await params;
    const body = (await req.json()) as PromoteBody;

    const requestedToStage = normalizeStageInput(body.toStage ?? body.to_stage);
    const actor = await getAuthenticatedActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((body.toStage || body.to_stage) && !requestedToStage) {
      return NextResponse.json(
        { error: "Invalid target stage" },
        { status: 400 },
      );
    }

    const result = await promoteEntity({
      entityType: "rule",
      entityId: ruleId,
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
      { error: "Failed to promote rule" },
      { status: 500 },
    );
  }
}
