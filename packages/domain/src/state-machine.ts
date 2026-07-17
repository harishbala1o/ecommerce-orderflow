import type { OrderStatus } from "./order-status.js";
import type { Role } from "./roles.js";
import { type OrderAction, findRule } from "./transitions.js";
import { IllegalTransitionError, ForbiddenTransitionError } from "./errors.js";

export interface TransitionInput {
  readonly current: OrderStatus;
  readonly action: OrderAction;
  readonly role: Role;
}

export interface TransitionResult {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly action: OrderAction;
}

export function applyTransition({ current, action, role }: TransitionInput): TransitionResult {
  const rule = findRule(current, action);
  if (!rule) {
    throw new IllegalTransitionError(current, action);
  }
  if (!rule.allowedRoles.includes(role)) {
    throw new ForbiddenTransitionError(role, action, current);
  }
  return { from: current, to: rule.to, action };
}
