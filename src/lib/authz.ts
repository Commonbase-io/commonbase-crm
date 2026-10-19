import { NotFoundError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/session";

export function assertAdmin(session: SessionUser): void {
  if (session.role !== "ADMIN") throw new NotFoundError();
}

export function assertPlatform(session: SessionUser): void {
  if (!session.isPlatformAdmin || !session.orgIsPlatform) throw new NotFoundError();
}
