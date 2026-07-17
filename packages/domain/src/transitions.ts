import type { OrderStatus } from "./order-status.js";
import type { Role } from "./roles.js";

export type OrderAction = "confirm" | "pack" | "ship" | "deliver" | "cancel" | "return";

export interface TransitionRule {
  readonly action: OrderAction;
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly allowedRoles: readonly Role[];
}

export const TRANSITIONS: readonly TransitionRule[] = [
  { action: "confirm", from: "PENDING", to: "CONFIRMED", allowedRoles: ["ops", "admin"] },
  { action: "pack", from: "CONFIRMED", to: "PACKED", allowedRoles: ["ops", "admin"] },
  { action: "ship", from: "PACKED", to: "SHIPPED", allowedRoles: ["ops", "admin"] },
  { action: "deliver", from: "SHIPPED", to: "DELIVERED", allowedRoles: ["ops", "admin"] },
  { action: "cancel", from: "PENDING", to: "CANCELLED", allowedRoles: ["customer", "ops", "admin"] },
  { action: "cancel", from: "CONFIRMED", to: "CANCELLED", allowedRoles: ["ops", "admin"] },
  { action: "cancel", from: "PACKED", to: "CANCELLED", allowedRoles: ["ops", "admin"] },
  { action: "cancel", from: "SHIPPED", to: "CANCELLED", allowedRoles: ["admin"] },
  { action: "return", from: "DELIVERED", to: "RETURNED", allowedRoles: ["ops", "admin"] },
];

export function findRule(from: OrderStatus, action: OrderAction): TransitionRule | undefined {
  return TRANSITIONS.find((rule) => rule.from === from && rule.action === action);
}

/**
 * Structural check only: is there *any* rule for this (status, action) pair,
 * regardless of who is asking? This ignores roles by design — it answers
 * "is this move possible in the workflow", not "is this actor allowed to make
 * it". For an authorization decision, use {@link applyTransition}, which is the
 * authoritative role-aware gate.
 */
export function canTransition(from: OrderStatus, action: OrderAction): boolean {
  return findRule(from, action) !== undefined;
}

/**
 * A status is terminal iff it has no outgoing transition. Derived from
 * {@link TRANSITIONS} so it can never drift from the actual state graph.
 */
export function isTerminal(status: OrderStatus): boolean {
  return !TRANSITIONS.some((rule) => rule.from === status);
}
