import { describe, it, expect } from "vitest";
import { UserThrottlerGuard } from "../src/common/user-throttler.guard.js";

/**
 * The tracker is the custom part of the guard: everything else is inherited from
 * @nestjs/throttler. getTracker does not touch the injected dependencies, so the
 * guard can be constructed with placeholders for this test.
 */
type TrackerAccess = { getTracker(req: Record<string, unknown>): Promise<string> };

function makeGuard(): TrackerAccess {
  const guard = new UserThrottlerGuard(
    [] as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return guard as unknown as TrackerAccess;
}

describe("UserThrottlerGuard tracker", () => {
  it("keys on the Hasura-forwarded user id when present", async () => {
    const key = await makeGuard().getTracker({
      body: { session_variables: { "x-hasura-user-id": "33333333-3333-3333-3333-333333333333" } },
      ip: "10.0.0.1",
    });
    expect(key).toBe("user:33333333-3333-3333-3333-333333333333");
  });

  it("prefers the user id over the IP, so one user cannot exhaust a shared address budget", async () => {
    const guard = makeGuard();
    const a = await guard.getTracker({
      body: { session_variables: { "x-hasura-user-id": "user-a" } },
      ip: "10.0.0.1",
    });
    const b = await guard.getTracker({
      body: { session_variables: { "x-hasura-user-id": "user-b" } },
      ip: "10.0.0.1",
    });
    expect(a).not.toBe(b);
  });

  it("falls back to the IP when there is no session user", async () => {
    const key = await makeGuard().getTracker({ body: {}, ip: "10.0.0.7" });
    expect(key).toBe("ip:10.0.0.7");
  });

  it("falls back to a stable placeholder when neither is available", async () => {
    const key = await makeGuard().getTracker({});
    expect(key).toBe("ip:unknown");
  });
});
