import { beforeEach, describe, expect, it } from "vitest";
import { decodeExpMs, isReviewDue } from "./session";
import { getReviewedAt, markReviewed } from "./tokens";

// Build a fake JWT (header.payload.signature) with a given exp (seconds).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

describe("decodeExpMs", () => {
  it("reads the exp claim as epoch-ms", () => {
    expect(decodeExpMs(fakeJwt({ sub: "u1", exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it("handles base64url payloads needing padding", () => {
    // exercise a payload whose base64 length isn't a multiple of 4
    const token = fakeJwt({ sub: "usr_abc", type: "access", exp: 1_812_345_678 });
    expect(decodeExpMs(token)).toBe(1_812_345_678_000);
  });

  it("returns null for junk, missing exp, or empty", () => {
    expect(decodeExpMs(null)).toBeNull();
    expect(decodeExpMs("")).toBeNull();
    expect(decodeExpMs("not-a-jwt")).toBeNull();
    expect(decodeExpMs(fakeJwt({ sub: "u1" }))).toBeNull(); // no exp
  });
});

describe("isReviewDue (3.5-day checkpoint)", () => {
  const HALF = 3.5 * 24 * 60 * 60 * 1000;
  beforeEach(() => localStorage.clear());

  it("is not due just after a review", () => {
    markReviewed();
    expect(isReviewDue()).toBe(false);
  });

  it("is due once half the 7-day window has elapsed", () => {
    const now = 1_000_000_000_000;
    markReviewed(now - HALF - 1000);
    expect(isReviewDue(now)).toBe(true);
  });

  it("is not due at just under the halfway mark", () => {
    const now = 1_000_000_000_000;
    markReviewed(now - HALF + 60_000);
    expect(isReviewDue(now)).toBe(false);
  });

  it("markReviewed round-trips", () => {
    markReviewed(1234567890000);
    expect(getReviewedAt()).toBe(1234567890000);
  });
});
