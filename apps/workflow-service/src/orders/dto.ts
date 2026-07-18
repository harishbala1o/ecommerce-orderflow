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
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .nonempty(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const transitionOrderSchema = z.object({
  orderId: z.string().uuid(),
  action: orderActionSchema,
});
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;

export const sessionSchema = z.object({
  role: z.enum(["customer", "ops", "admin"]),
  userId: z.string().uuid().nullish(),
});
export type Session = z.infer<typeof sessionSchema>;
