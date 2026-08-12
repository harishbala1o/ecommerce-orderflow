import { z } from "zod";

export const reserveSchema = z.object({
  orderId: z.string().uuid(),
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
export type ReserveInput = z.infer<typeof reserveSchema>;

export const orderRefSchema = z.object({ orderId: z.string().uuid() });
export type OrderRef = z.infer<typeof orderRefSchema>;

export const receiveSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().max(100_000),
  reason: z.string().max(500).optional(),
});
export type ReceiveInput = z.infer<typeof receiveSchema>;
