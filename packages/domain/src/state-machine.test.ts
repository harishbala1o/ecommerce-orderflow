import { describe, it, expect } from "vitest";
import { applyTransition } from "./state-machine.js";
import { IllegalTransitionError, ForbiddenTransitionError } from "./errors.js";

describe("applyTransition", () => {
  it("advances a valid transition for a permitted role", () => {
    const result = applyTransition({ current: "PENDING", action: "confirm", role: "ops" });
    expect(result).toEqual({ from: "PENDING", to: "CONFIRMED", action: "confirm" });
  });

  it("lets a customer cancel their PENDING order", () => {
    const result = applyTransition({ current: "PENDING", action: "cancel", role: "customer" });
    expect(result.to).toBe("CANCELLED");
  });

  it("throws IllegalTransitionError when no rule exists", () => {
    expect(() => applyTransition({ current: "DELIVERED", action: "ship", role: "admin" }))
      .toThrow(IllegalTransitionError);
  });

  it("throws ForbiddenTransitionError when the role is not permitted", () => {
    expect(() => applyTransition({ current: "PENDING", action: "confirm", role: "customer" }))
      .toThrow(ForbiddenTransitionError);
  });

  it("forbids a customer cancelling a CONFIRMED order", () => {
    expect(() => applyTransition({ current: "CONFIRMED", action: "cancel", role: "customer" }))
      .toThrow(ForbiddenTransitionError);
  });

  it("allows admin force-cancel of a SHIPPED order", () => {
    expect(applyTransition({ current: "SHIPPED", action: "cancel", role: "admin" }).to)
      .toBe("CANCELLED");
  });

  it("forbids ops force-cancel of a SHIPPED order", () => {
    expect(() => applyTransition({ current: "SHIPPED", action: "cancel", role: "ops" }))
      .toThrow(ForbiddenTransitionError);
  });
});
