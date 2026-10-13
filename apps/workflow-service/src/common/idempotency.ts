import { createHash } from "node:crypto";

/**
 * Stable fingerprint of a request payload.
 *
 * Object keys are sorted recursively so that two logically identical payloads
 * that differ only in key order produce the same fingerprint. Without that, a
 * client retry serialising its JSON differently would look like a conflicting
 * request.
 */
export function fingerprint(payload: unknown): string {
  return createHash("sha256").update(canonicalise(payload)).digest("hex");
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}
