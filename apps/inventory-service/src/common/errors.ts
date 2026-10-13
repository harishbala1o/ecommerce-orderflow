/**
 * Service error classes, mapped to HTTP status in action-error.ts.
 *
 * The distinction that matters most is business rejection versus infrastructure
 * failure. A business rejection is the service working correctly and must not be
 * retried; an infrastructure failure must surface as 5xx so that Hasura retries
 * it and so that it counts against the error budget. Collapsing the two into a
 * single 400, as this previously did, loses both properties.
 */

/** Base for "the request was understood and correctly refused". */
export abstract class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Base for "something we depend on failed". Always a 5xx. */
export abstract class InfrastructureError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

export class InsufficientStockError extends BusinessError {
  constructor(
    public readonly productId: string,
    public readonly requested: number,
    public readonly availableQty: number,
  ) {
    super(`Insufficient stock for ${productId}: requested ${requested}, available ${availableQty}`);
  }
}

export class UnknownStockItemError extends BusinessError {
  constructor(public readonly productId: string) {
    super(`Unknown stock item: ${productId}`);
  }
}

export class ReservationNotFoundError extends BusinessError {
  constructor(public readonly orderId: string) {
    super(`No reservation found for order ${orderId}`);
  }
}

/**
 * The same order already holds a different quantity of this product.
 *
 * This is a conflict rather than a fresh reservation: replaying a request with a
 * changed payload must never silently apply the new one over the old.
 */
export class ReservationConflictError extends BusinessError {
  constructor(
    public readonly orderId: string,
    public readonly productId: string,
    public readonly existingQty: number,
    public readonly requestedQty: number,
  ) {
    super(
      `Order ${orderId} already holds ${existingQty} of ${productId}; ` +
        `cannot change the hold to ${requestedQty}`,
    );
  }
}

/** A database call failed. Distinct from any business outcome. */
export class StorageError extends InfrastructureError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
