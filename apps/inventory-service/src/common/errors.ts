/** Service-level errors, mapped to structured responses in action-error.ts. */

export class InsufficientStockError extends Error {
  constructor(
    public readonly productId: string,
    public readonly requested: number,
    public readonly availableQty: number,
  ) {
    super(`Insufficient stock for ${productId}: requested ${requested}, available ${availableQty}`);
    this.name = "InsufficientStockError";
  }
}

export class UnknownStockItemError extends Error {
  constructor(public readonly productId: string) {
    super(`Unknown stock item: ${productId}`);
    this.name = "UnknownStockItemError";
  }
}

export class ReservationNotFoundError extends Error {
  constructor(public readonly orderId: string) {
    super(`No reservation found for order ${orderId}`);
    this.name = "ReservationNotFoundError";
  }
}
