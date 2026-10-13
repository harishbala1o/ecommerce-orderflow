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
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const transitionOrderSchema = z.object({
  orderId: z.string().uuid(),
  action: orderActionSchema,
});
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;

export const sessionSchema = z.object({
  // Derived from the domain role list so a new role cannot be accepted here
  // without the state machine knowing about it.
  role: z.enum(ROLES),
  userId: z.string().uuid().nullish(),
});
export type Session = z.infer<typeof sessionSchema>;
