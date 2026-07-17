import { describe, it, expect } from "vitest";
import { ORDER_STATUSES } from "./order-status.js";
import { TRANSITIONS, findRule, canTransition, isTerminal } from "./transitions.js";

describe("transition table", () => {
  it("defines the happy-path chain", () => {
    expect(findRule("PENDING", "confirm")?.to).toBe("CONFIRMED");
    expect(findRule("CONFIRMED", "pack")?.to).toBe("PACKED");
    expect(findRule("PACKED", "ship")?.to).toBe("SHIPPED");
    expect(findRule("SHIPPED", "deliver")?.to).toBe("DELIVERED");
    expect(findRule("DELIVERED", "return")?.to).toBe("RETURNED");
  });

  it("allows cancel from PENDING, CONFIRMED, PACKED, and SHIPPED", () => {
    expect(canTransition("PENDING", "cancel")).toBe(true);
    expect(canTransition("CONFIRMED", "cancel")).toBe(true);
    expect(canTransition("PACKED", "cancel")).toBe(true);
    expect(canTransition("SHIPPED", "cancel")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransition("DELIVERED", "ship")).toBe(false);
    expect(canTransition("CANCELLED", "confirm")).toBe(false);
    expect(canTransition("RETURNED", "return")).toBe(false);
  });

  it("rejects skipping steps", () => {
    expect(canTransition("PENDING", "ship")).toBe(false);
    expect(canTransition("CONFIRMED", "deliver")).toBe(false);
  });

  it("restricts force-cancel of a SHIPPED order to admin only", () => {
    expect(findRule("SHIPPED", "cancel")?.allowedRoles).toEqual(["admin"]);
  });

  it("lets a customer cancel only from PENDING", () => {
    expect(findRule("PENDING", "cancel")?.allowedRoles).toContain("customer");
    expect(findRule("CONFIRMED", "cancel")?.allowedRoles).not.toContain("customer");
  });
});

describe("isTerminal", () => {
  it("treats only CANCELLED and RETURNED as terminal", () => {
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("RETURNED")).toBe(true);
  });

  it("treats DELIVERED as non-terminal — a return can still be initiated", () => {
    expect(isTerminal("DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "return")).toBe(true);
  });

  it("treats all in-flight statuses as non-terminal", () => {
    for (const status of ["PENDING", "CONFIRMED", "PACKED", "SHIPPED"] as const) {
      expect(isTerminal(status)).toBe(false);
    }
  });

  it("invariant: a status is terminal iff it has no outgoing transition", () => {
    for (const status of ORDER_STATUSES) {
      const hasOutgoing = TRANSITIONS.some((rule) => rule.from === status);
      expect(isTerminal(status)).toBe(!hasOutgoing);
    }
  });
});
