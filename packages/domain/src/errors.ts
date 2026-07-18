import type { OrderStatus } from "./order-status.js";
import type { Role } from "./roles.js";
import type { OrderAction } from "./transitions.js";

export class DomainError extends Error {}

export class IllegalTransitionError extends DomainError {
  constructor(public readonly from: OrderStatus, public readonly action: OrderAction) {
    super(`Illegal transition: cannot '${action}' from '${from}'`);
    this.name = "IllegalTransitionError";
  }
}

export class ForbiddenTransitionError extends DomainError {
  constructor(
    public readonly role: Role,
    public readonly action: OrderAction,
    public readonly from: OrderStatus,
  ) {
    super(`Role '${role}' may not '${action}' from '${from}'`);
    this.name = "ForbiddenTransitionError";
  }
}

export class InsufficientStockError extends DomainError {
  constructor(
    public readonly productId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Insufficient stock for product '${productId}': requested ${requested}, available ${available}`,
    );
    this.name = "InsufficientStockError";
  }
}
