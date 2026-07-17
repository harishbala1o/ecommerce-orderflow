import { describe, it, expect } from "vitest";
import { findRule, canTransition } from "./transitions.js";

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
