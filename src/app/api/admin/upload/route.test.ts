import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCX_TYPE, MAX_UPLOAD_BYTES, UPLOAD_REFUSED_MESSAGE } from "@/lib/content/upload-rules";

// U6 step 3: the upload route. issueSignedToken (a call to the Blob API) is
// replaced by a fake that builds a delegation token locally; the real
// handleUploadPresigned then signs the upload URL, and its parameters show the
// options that Blob will enforce. No Blob store and no network are needed.

const owner = vi.hoisted(() => ({ result: { ok: true, userId: "user_owner" } as unknown }));
const issued = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("@/lib/auth/owner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/owner")>("@/lib/auth/owner");
  return { ...actual, getOwnerCheck: vi.fn(async () => owner.result) };
});
vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vercel/blob")>();
  return {
    ...actual,
    issueSignedToken: vi.fn(async (options: Record<string, unknown>) => {
      issued.push(options);
      const scope = {
        pathname: options.pathname,
        operations: options.operations,
        validUntil: options.validUntil,
        allowedContentTypes: options.allowedContentTypes,
        maximumSizeInBytes: options.maximumSizeInBytes,
      };
      const payload = Buffer.from(JSON.stringify(scope)).toString("base64url");
      return { delegationToken: `${payload}.fake-signature`, clientSigningToken: "fake-signing-key", validUntil: options.validUntil };
    }),
  };
});

import { POST } from "./route";

function urlRequest(pathname: string, claim: unknown) {
  return new Request("http://localhost:3001/api/admin/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-presigned-url",
      payload: { pathname, clientPayload: claim === null ? null : JSON.stringify(claim), multipart: false },
    }),
  });
}

beforeEach(() => {
  issued.length = 0;
  owner.result = { ok: true, userId: "user_owner" };
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DEV_READ_WRITE_TOKEN", "");
  vi.stubEnv("DEV_STORE_ID", "store_dev123");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("BLOB_STORE_ID", "");
  vi.stubEnv("CONTENT_ROOT", "e2e-root");
  vi.stubEnv("CONTENT_PATH_SECRET", "a-secret-segment-0123456789");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The signed upload parameters for an allowed request. */
async function paramsFor(pathname: string, claim: unknown): Promise<Record<string, string>> {
  const response = await POST(urlRequest(pathname, claim));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body.type).toBe("blob.generate-presigned-url");
  return body.presignedUrlPayload.params;
}

function param(params: Record<string, string>, part: string): string | undefined {
  return Object.entries(params).find(([key]) => key.includes(part))?.[1];
}

describe("POST /api/admin/upload", () => {
  it("gives the owner an upload URL for one allowed file under the media prefix, with a random suffix and the 25 MB limit", async () => {
    const params = await paramsFor("e2e-root/media/photo.jpg", { contentType: "image/jpeg", size: 1234 });
    expect(param(params, "random-suffix")).toBe("true");
    expect(param(params, "overwrite")).toBe("false");
    expect(param(params, "maximum-size")).toBe(String(MAX_UPLOAD_BYTES));
    expect(param(params, "content-types")).toBe("image/jpeg");
    // No upload-completed callback: the browser saves the file into the draft itself.
    expect(param(params, "callback")).toBeUndefined();
    // The token covers this one pathname, writes only, with this environment's store.
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({
      storeId: "store_dev123",
      pathname: "e2e-root/media/photo.jpg",
      operations: ["put"],
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
    });
    expect(issued[0].validUntil as number).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);
  });

  it("two uploads with the same name both get the random suffix, so their pathnames differ", async () => {
    const first = await paramsFor("e2e-root/media/report.pdf", { contentType: "application/pdf", size: 10 });
    const second = await paramsFor("e2e-root/media/report.pdf", { contentType: "application/pdf", size: 10 });
    expect(param(first, "random-suffix")).toBe("true");
    expect(param(second, "random-suffix")).toBe("true");
  });

  it("accepts a DOCX file, and uses a read-write token when one exists", async () => {
    vi.stubEnv("DEV_READ_WRITE_TOKEN", "vercel_blob_rw_dev_secret");
    const params = await paramsFor("e2e-root/media/record.docx", { contentType: DOCX_TYPE, size: 10 });
    expect(param(params, "content-types")).toBe(DOCX_TYPE);
    expect(issued[0]).toMatchObject({ token: "vercel_blob_rw_dev_secret" });
  });

  for (const [what, pathname, claim] of [
    [".exe", "e2e-root/media/tool.exe", { contentType: "application/x-msdownload", size: 10 }],
    [".svg", "e2e-root/media/logo.svg", { contentType: "image/svg+xml", size: 10 }],
    ["over 25 MB", "e2e-root/media/big.pdf", { contentType: "application/pdf", size: MAX_UPLOAD_BYTES + 1 }],
    ["outside the media prefix", "site/media/photo.jpg", { contentType: "image/jpeg", size: 10 }],
    ["a draft path", "e2e-root/a-secret-segment-0123456789/draft.json", { contentType: "image/jpeg", size: 10 }],
  ] as const) {
    it(`refuses ${what}, with a message that names the allowed types and the limit, and issues no token`, async () => {
      const response = await POST(urlRequest(pathname, claim));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: UPLOAD_REFUSED_MESSAGE });
      expect(issued).toHaveLength(0);
    });
  }

  it("refuses a visitor without a session and a user who is not the owner, with no token", async () => {
    owner.result = { ok: false, reason: "signed-out", status: 401 };
    let response = await POST(urlRequest("e2e-root/media/photo.jpg", { contentType: "image/jpeg", size: 10 }));
    expect(response.status).toBe(401);

    owner.result = { ok: false, reason: "not-owner", status: 403 };
    response = await POST(urlRequest("e2e-root/media/photo.jpg", { contentType: "image/jpeg", size: 10 }));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toMatch(/delegationToken|signature/);
    expect(issued).toHaveLength(0);
  });

  it("refuses an upload-completed callback and the old client-token request", async () => {
    for (const type of ["blob.upload-completed", "blob.generate-client-token"]) {
      const response = await POST(
        new Request("http://localhost/api/admin/upload", { method: "POST", body: JSON.stringify({ type, payload: {} }) }),
      );
      expect(response.status).toBe(400);
    }
    expect(issued).toHaveLength(0);
  });

  it("never uses the Production store outside Production", async () => {
    vi.stubEnv("DEV_STORE_ID", "");
    vi.stubEnv("BLOB_STORE_ID", "store_prod");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_prod_secret");
    const response = await POST(urlRequest("e2e-root/media/photo.jpg", { contentType: "image/jpeg", size: 10 }));
    expect(response.status).toBe(503);
    expect(issued).toHaveLength(0);
  });
});
