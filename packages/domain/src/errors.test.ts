import { describe, it, expect } from "vitest";
import { DomainError, InsufficientStockError } from "./errors.js";

describe("InsufficientStockError", () => {
  it("is a DomainError carrying product, requested, and available", () => {
    const err = new InsufficientStockError("p-1", 5, 2);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.productId).toBe("p-1");
    expect(err.requested).toBe(5);
    expect(err.available).toBe(2);
    expect(err.message).toMatch(/requested 5, available 2/);
  });
});
