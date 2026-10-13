import { ROLES } from "@ecommerce-orderflow/domain";
import { z } from "zod";

export const orderActionSchema = z.enum([
  "confirm",
  "pack",
  "ship",
  "deliver",
  "cancel",
  "return",
]);

export const placeOrderSchema = z.object({
  // Bounded to keep a single order's work (and its transaction) small and
  // predictable; these are generous limits, not business rules.
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(1000),
      }),
    )
    .nonempty()
    .max(100),
  /**
   * Optional caller-supplied key. Scoped to (operation, actor, key) with a
   * payload fingerprint, so a retry after a timeout returns the original order
   * instead of placing a second one.
   */
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;


export const transitionOrderSchema = z.object({
  orderId: z.string().uuid(),
  action: orderActionSchema,
  /**
   * The version the caller believes it is acting on. Optional so existing
   * clients keep working, but when supplied a mismatch is rejected rather than
   * silently overwriting another operator's change.
   */
  expectedVersion: z.number().int().positive().optional(),
  /** Free-text justification, required by the UI for high-risk actions. */
  reason: z.string().trim().min(1).max(500).optional(),
});
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;

export const sessionSchema = z.object({
  // Derived from the domain role list so a new role cannot be accepted here
  // without the state machine knowing about it.
  role: z.enum(ROLES),
  userId: z.string().uuid().nullish(),
});
export type Session = z.infer<typeof sessionSchema>;
