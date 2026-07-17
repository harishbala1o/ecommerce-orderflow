export const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
