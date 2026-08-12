/**
 * Pure stock rules. No database, no framework, no input or output, so these can
 * be tested exhaustively in milliseconds. This mirrors the role the domain
 * package plays for the order state machine.
 */

export type AlertLevel = "LOW" | "OUT_OF_STOCK";

export interface StockLevels {
  readonly onHand: number;
  readonly reserved: number;
  readonly reorderLevel: number;
  readonly reorderQty: number;
}

/** Stock that can still be promised to a new order. */
export function available(levels: Pick<StockLevels, "onHand" | "reserved">): number {
  return levels.onHand - levels.reserved;
}

/** Whether a quantity can be reserved right now. */
export function canReserve(
  levels: Pick<StockLevels, "onHand" | "reserved">,
  quantity: number,
): boolean {
  return quantity > 0 && available(levels) >= quantity;
}

/**
 * The alert level implied by current availability, or null when stock is healthy.
 * Out of stock takes precedence over low.
 */
export function alertLevelFor(levels: StockLevels): AlertLevel | null {
  const avail = available(levels);
  if (avail <= 0) return "OUT_OF_STOCK";
  if (avail <= levels.reorderLevel) return "LOW";
  return null;
}

/**
 * How much to suggest reordering. Enough to clear the reorder level with headroom,
 * never less than the configured reorder quantity.
 */
export function suggestedReorderQty(levels: StockLevels): number {
  const target = levels.reorderLevel * 2 - available(levels);
  return Math.max(levels.reorderQty, target, 0);
}
