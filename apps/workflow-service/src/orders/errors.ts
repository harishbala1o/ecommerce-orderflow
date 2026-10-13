/** Service-level errors (distinct from pure domain errors in @ecommerce-orderflow/domain). */

export class OrderNotFoundError extends Error {
  constructor(public readonly orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = "OrderNotFoundError";
  }
}

export class UnknownProductError extends Error {
  constructor(public readonly productId: string) {
    super(`Unknown product: ${productId}`);
    this.name = "UnknownProductError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Authenticated user required") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * The same idempotency key was reused with a different payload.
 *
 * Replaying the stored response would answer a question that was not asked, and
 * applying the new payload would make the key meaningless. Both are wrong, so
 * this is a conflict the caller must resolve.
 */
export class IdempotencyConflictError extends Error {
  constructor(public readonly key: string) {
    super(`Idempotency key '${key}' was already used with a different payload`);
    this.name = "IdempotencyConflictError";
  }
}

/**
 * The caller acted on a version of the order that is no longer current,
 * meaning someone else changed it first.
 */
export class VersionConflictError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly expected: number,
    public readonly actual: number,
    public readonly currentStatus: string,
  ) {
    super(
      `Order ${orderId} has moved on: expected version ${expected}, found ${actual} ` +
        `(now ${currentStatus})`,
    );
    this.name = "VersionConflictError";
  }
}
