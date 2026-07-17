import { describe, it, expect } from "vitest";
import { ORDER_STATUSES } from "./order-status.js";

describe("order status", () => {
  it("declares all seven statuses", () => {
    expect(ORDER_STATUSES).toEqual([
      "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED",
    ]);
  });
});
