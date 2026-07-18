import { sessionSchema, type Session } from "../orders/dto.js";
import { UnauthenticatedError } from "../orders/errors.js";
import type { HasuraActionBody } from "./hasura.js";

/** Derives the actor from Hasura's forwarded session variables (JWT claims in M4). */
export function parseSession(body: HasuraActionBody): Session {
  const vars = body.session_variables ?? {};
  const result = sessionSchema.safeParse({
    role: vars["x-hasura-role"],
    userId: vars["x-hasura-user-id"] ?? undefined,
  });
  if (!result.success) {
    throw new UnauthenticatedError("missing or invalid session variables");
  }
  return result.data;
}
