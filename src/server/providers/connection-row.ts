import { z } from "zod";

// Text + check-constraint columns arrive as `string`; parse them into the
// narrow unions the code relies on instead of casting.

export const connectionStatusSchema = z.enum(["disconnected", "pending", "connected", "error", "revoked"]);
export const connectionModeSchema = z.enum(["mock", "live"]);
export const partySchema = z.enum(["client", "commonbase"]);
export const providerSchema = z.enum(["apollo"]);
