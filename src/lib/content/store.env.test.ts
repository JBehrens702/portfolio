import { describe, expect, it } from "vitest";
import { blobCredentialsFromEnv, contentSourceFromEnv } from "./store";

// The owner connected the Production store with the prefix BLOB and the
// development store with the prefix DEV. Vercel gives each a store ID
// (BLOB_STORE_ID, DEV_STORE_ID) and signs in with VERCEL_OIDC_TOKEN; a fixed
// read-write token (BLOB_READ_WRITE_TOKEN, DEV_READ_WRITE_TOKEN) is optional.
// Only a Production deployment may use the Production store.

describe("blobCredentialsFromEnv", () => {
  it("uses the Production store ID on a Production deployment", () => {
    expect(
      blobCredentialsFromEnv({ VERCEL_ENV: "production", BLOB_STORE_ID: "store_prod", DEV_STORE_ID: "store_dev" }),
    ).toEqual({ storeId: "store_prod" });
  });

  it("uses the development store ID on a Preview deployment, even when the Production ID is visible", () => {
    expect(
      blobCredentialsFromEnv({ VERCEL_ENV: "preview", BLOB_STORE_ID: "store_prod", DEV_STORE_ID: "store_dev" }),
    ).toEqual({ storeId: "store_dev" });
  });

  it("uses the development store locally, where VERCEL_ENV is not set", () => {
    expect(blobCredentialsFromEnv({ BLOB_STORE_ID: "store_prod", DEV_STORE_ID: "store_dev" })).toEqual({
      storeId: "store_dev",
    });
  });

  it("prefers a fixed read-write token for the same store when one exists", () => {
    expect(blobCredentialsFromEnv({ DEV_READ_WRITE_TOKEN: "dev-token", DEV_STORE_ID: "store_dev" })).toEqual({
      token: "dev-token",
    });
    expect(
      blobCredentialsFromEnv({ VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "prod-token", BLOB_STORE_ID: "store_prod" }),
    ).toEqual({ token: "prod-token" });
  });

  it("never falls back to the Production store outside Production", () => {
    expect(blobCredentialsFromEnv({ BLOB_READ_WRITE_TOKEN: "prod-token", BLOB_STORE_ID: "store_prod" })).toBeUndefined();
  });

  it("treats blank values as missing", () => {
    expect(blobCredentialsFromEnv({ DEV_READ_WRITE_TOKEN: "  ", DEV_STORE_ID: " " })).toBeUndefined();
  });
});

describe("contentSourceFromEnv with the two stores", () => {
  it("selects Blob locally when the development store is configured", () => {
    expect(contentSourceFromEnv({ DEV_STORE_ID: "store_dev" })).toEqual({ kind: "blob" });
  });

  it("selects no content locally when only the Production store is configured", () => {
    expect(contentSourceFromEnv({ BLOB_STORE_ID: "store_prod" })).toEqual({ kind: "none" });
  });

  it("selects Blob on Production with the Production store", () => {
    expect(contentSourceFromEnv({ VERCEL_ENV: "production", BLOB_STORE_ID: "store_prod" })).toEqual({ kind: "blob" });
  });
});
