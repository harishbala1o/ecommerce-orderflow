import { describe, it, expect } from "vitest";
import { ORDER_STATUSES, isTerminal } from "./order-status.js";

describe("order status", () => {
  it("declares all seven statuses", () => {
    expect(ORDER_STATUSES).toEqual([
      "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED",
    ]);
  });

  it("marks DELIVERED, CANCELLED, RETURNED as terminal", () => {
    expect(isTerminal("DELIVERED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("RETURNED")).toBe(true);
  });

  it("marks in-flight statuses as non-terminal", () => {
    expect(isTerminal("PENDING")).toBe(false);
    expect(isTerminal("CONFIRMED")).toBe(false);
    expect(isTerminal("PACKED")).toBe(false);
    expect(isTerminal("SHIPPED")).toBe(false);
  });
});
