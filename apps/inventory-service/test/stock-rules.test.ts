import { describe, it, expect } from "vitest";
import {
  available,
  canReserve,
  alertLevelFor,
  suggestedReorderQty,
} from "../src/inventory/stock-rules.js";

const levels = (onHand: number, reserved: number, reorderLevel = 5, reorderQty = 10) => ({
  onHand,
  reserved,
  reorderLevel,
  reorderQty,
});

describe("available", () => {
  it("is on hand minus reserved", () => {
    expect(available(levels(10, 3))).toBe(7);
  });

  it("is zero when everything on hand is reserved", () => {
    expect(available(levels(4, 4))).toBe(0);
  });
});

describe("canReserve", () => {
  it("allows a quantity up to availability", () => {
    expect(canReserve(levels(10, 3), 7)).toBe(true);
  });

  it("rejects a quantity beyond availability, even when stock is physically present", () => {
    // 10 on hand but 8 already promised to other orders: only 2 may be sold.
    expect(canReserve(levels(10, 8), 3)).toBe(false);
  });

  it("rejects zero and negative quantities", () => {
    expect(canReserve(levels(10, 0), 0)).toBe(false);
    expect(canReserve(levels(10, 0), -1)).toBe(false);
  });

  it("rejects everything when nothing is available", () => {
    expect(canReserve(levels(5, 5), 1)).toBe(false);
  });
});

describe("alertLevelFor", () => {
  it("reports OUT_OF_STOCK when nothing is available", () => {
    expect(alertLevelFor(levels(5, 5))).toBe("OUT_OF_STOCK");
  });

  it("prefers OUT_OF_STOCK over LOW", () => {
    // availability of 0 is also at or below the reorder level; the more severe wins
    expect(alertLevelFor(levels(5, 5, 5))).toBe("OUT_OF_STOCK");
  });

  it("reports LOW at the reorder level boundary", () => {
    expect(alertLevelFor(levels(5, 0, 5))).toBe("LOW");
  });

  it("reports nothing one unit above the reorder level", () => {
    expect(alertLevelFor(levels(6, 0, 5))).toBeNull();
  });

  it("counts reserved stock against availability when deciding", () => {
    // 20 physically present, but 16 promised: only 4 available, below a level of 5
    expect(alertLevelFor(levels(20, 16, 5))).toBe("LOW");
  });
});

describe("suggestedReorderQty", () => {
  it("never suggests less than the configured reorder quantity", () => {
    expect(suggestedReorderQty(levels(6, 0, 5, 10))).toBe(10);
  });

  it("suggests enough to clear twice the reorder level when that is larger", () => {
    // reorderLevel 50, available 0 -> target 100, larger than reorderQty 10
    expect(suggestedReorderQty(levels(0, 0, 50, 10))).toBe(100);
  });

  it("is never negative", () => {
    expect(suggestedReorderQty(levels(100, 0, 5, 0))).toBe(0);
  });
});
