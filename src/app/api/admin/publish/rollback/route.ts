import { NextRequest, NextResponse } from "next/server";
import {
  rollbackEntity,
  PublishEntityType,
  PublishServiceError,
} from "@/lib/admin/publish-service";
import { getAuthenticatedActor } from "@/lib/admin/authenticated-actor";

export const dynamic = "force-dynamic";

interface RollbackBody {
  entity_type?: PublishEntityType;
  entity_id?: string;
  reason?: string;

  entityType?: PublishEntityType;
  entityId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RollbackBody;
    const entityType = body.entity_type ?? body.entityType;
    const entityId = body.entity_id ?? body.entityId;
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

    const result = await rollbackEntity({
      entityType,
      entityId,
      actor,
      reason: body.reason,
    });

    return NextResponse.json({ success: true, publish: result.publish });
  } catch (error) {
    if (error instanceof PublishServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Failed to rollback entity" },
      { status: 500 },
    );
  }
}
