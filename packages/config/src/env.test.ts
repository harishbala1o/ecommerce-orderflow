import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("parses a valid environment with defaults applied", () => {
    const env = loadEnv({ NODE_ENV: "development" });
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("accepts an explicit LOG_LEVEL", () => {
    const env = loadEnv({ NODE_ENV: "test", LOG_LEVEL: "debug" });
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("throws a readable error for an invalid NODE_ENV", () => {
    expect(() => loadEnv({ NODE_ENV: "staging" })).toThrowError(/NODE_ENV/);
  });

  it("throws for an invalid LOG_LEVEL", () => {
    expect(() => loadEnv({ NODE_ENV: "test", LOG_LEVEL: "loud" })).toThrowError(/LOG_LEVEL/);
  });
});
