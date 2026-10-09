import { describe, expect, it } from "vitest";
import { blobTokenFromEnv, contentSourceFromEnv } from "./store";

// The Production store's token is BLOB_READ_WRITE_TOKEN; the development
// store's token is DEV_READ_WRITE_TOKEN (Vercel prefix "DEV"). Only a
// Production deployment may use the Production store.
const both = { BLOB_READ_WRITE_TOKEN: "prod-token", DEV_READ_WRITE_TOKEN: "dev-token" };

describe("blobTokenFromEnv", () => {
  it("uses the Production token on a Production deployment", () => {
    expect(blobTokenFromEnv({ ...both, VERCEL_ENV: "production" })).toBe("prod-token");
  });

  it("uses the development token on a Preview deployment, even when the Production token is visible", () => {
    expect(blobTokenFromEnv({ ...both, VERCEL_ENV: "preview" })).toBe("dev-token");
  });

  it("uses the development token locally, where VERCEL_ENV is not set", () => {
    expect(blobTokenFromEnv(both)).toBe("dev-token");
  });

  it("never falls back to the Production token outside Production", () => {
    expect(blobTokenFromEnv({ BLOB_READ_WRITE_TOKEN: "prod-token" })).toBeUndefined();
  });

  it("treats a blank token as missing", () => {
    expect(blobTokenFromEnv({ DEV_READ_WRITE_TOKEN: "  " })).toBeUndefined();
  });
});

describe("contentSourceFromEnv with the two tokens", () => {
  it("selects Blob locally when the development token is set", () => {
    expect(contentSourceFromEnv({ DEV_READ_WRITE_TOKEN: "dev-token" })).toEqual({ kind: "blob" });
  });

  it("selects no content locally when only the Production token is set", () => {
    expect(contentSourceFromEnv({ BLOB_READ_WRITE_TOKEN: "prod-token" })).toEqual({ kind: "none" });
  });

  it("selects Blob on Production with the Production token", () => {
    expect(contentSourceFromEnv({ VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "prod-token" })).toEqual({ kind: "blob" });
  });
});
