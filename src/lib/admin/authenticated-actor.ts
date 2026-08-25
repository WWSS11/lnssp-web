import { auth } from "@/lib/auth";

/**
 * 发布审计只接受 Auth.js 签发的稳定主体 ID。请求体中的显示名不构成身份。
 */
export async function getAuthenticatedActor(): Promise<string | null> {
  const session = await auth();
  const actor = session?.user?.id;
  return typeof actor === "string" && actor.trim().length > 0 ? actor : null;
}
