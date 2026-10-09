import { describe, expect, it } from "vitest";
import { blobCredentialsFromEnv, contentSourceFromEnv, docsCredentialsFromEnv } from "./store";

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

describe("docsCredentialsFromEnv (private stores for the JSON documents)", () => {
  it("uses the Production documents store on a Production deployment", () => {
    expect(
      docsCredentialsFromEnv({ VERCEL_ENV: "production", DOCS_STORE_ID: "store_docs", DEVDOCS_STORE_ID: "store_devdocs" }),
    ).toEqual({ storeId: "store_docs" });
  });

  it("uses the development documents store everywhere else", () => {
    expect(docsCredentialsFromEnv({ DOCS_STORE_ID: "store_docs", DEVDOCS_STORE_ID: "store_devdocs" })).toEqual({
      storeId: "store_devdocs",
    });
    expect(
      docsCredentialsFromEnv({ VERCEL_ENV: "preview", DOCS_STORE_ID: "store_docs", DEVDOCS_STORE_ID: "store_devdocs" }),
    ).toEqual({ storeId: "store_devdocs" });
  });

  it("never uses a media store for documents", () => {
    expect(docsCredentialsFromEnv({ DEV_STORE_ID: "store_dev", BLOB_STORE_ID: "store_prod" })).toBeUndefined();
  });

  it("never falls back to the Production documents store outside Production", () => {
    expect(docsCredentialsFromEnv({ DOCS_STORE_ID: "store_docs" })).toBeUndefined();
  });
});

describe("contentSourceFromEnv with the documents stores", () => {
  it("selects Blob locally when the development documents store is configured", () => {
    expect(contentSourceFromEnv({ DEVDOCS_STORE_ID: "store_devdocs" })).toEqual({ kind: "blob" });
  });

  it("selects no content when only a media store is configured", () => {
    expect(contentSourceFromEnv({ DEV_STORE_ID: "store_dev" })).toEqual({ kind: "none" });
  });

  it("selects no content locally when only the Production documents store is configured", () => {
    expect(contentSourceFromEnv({ DOCS_STORE_ID: "store_docs" })).toEqual({ kind: "none" });
  });

  it("selects Blob on Production with the Production documents store", () => {
    expect(contentSourceFromEnv({ VERCEL_ENV: "production", DOCS_STORE_ID: "store_docs" })).toEqual({ kind: "blob" });
  });
});
