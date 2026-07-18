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
