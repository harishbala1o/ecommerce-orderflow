export const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set(["DELIVERED", "CANCELLED", "RETURNED"]);

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
