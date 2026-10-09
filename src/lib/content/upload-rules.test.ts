import { describe, expect, it } from "vitest";
import {
  DOCX_TYPE,
  IMAGE_REFUSED_MESSAGE,
  MAX_UPLOAD_BYTES,
  UPLOAD_REFUSED_MESSAGE,
  checkTokenRequest,
  checkUpload,
  safeFileName,
} from "./upload-rules";

// U6 step 3: only JPEG, PNG, WebP, GIF, PDF, and DOCX of at most 25 MB.

describe("checkUpload (browser)", () => {
  it("accepts each allowed type", () => {
    for (const [name, type] of [
      ["a.jpg", "image/jpeg"],
      ["a.JPEG", "image/jpeg"],
      ["a.png", "image/png"],
      ["a.webp", "image/webp"],
      ["a.gif", "image/gif"],
      ["a.pdf", "application/pdf"],
      ["a.docx", DOCX_TYPE],
      ["a.docx", ""],
    ]) {
      expect(checkUpload({ name, type, size: 1000 })).toMatchObject({ ok: true });
    }
  });

  it("refuses SVG, EXE, a mismatched type, an empty file, and a file over 25 MB, naming the types and the limit", () => {
    for (const file of [
      { name: "logo.svg", type: "image/svg+xml", size: 100 },
      { name: "tool.exe", type: "application/x-msdownload", size: 100 },
      { name: "photo.jpg", type: "image/svg+xml", size: 100 },
      { name: "photo.svg", type: "image/jpeg", size: 100 },
      { name: "photo.jpg", type: "image/jpeg", size: 0 },
      { name: "big.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 },
    ]) {
      expect(checkUpload(file)).toEqual({ ok: false, message: UPLOAD_REFUSED_MESSAGE });
    }
    expect(UPLOAD_REFUSED_MESSAGE).toMatch(/JPEG, PNG, WebP, GIF, PDF, and DOCX/);
    expect(UPLOAD_REFUSED_MESSAGE).toMatch(/25 MB/);
    expect(checkUpload({ name: "a.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES })).toMatchObject({ ok: true });
  });

  it("image fields take images only", () => {
    expect(checkUpload({ name: "a.pdf", type: "application/pdf", size: 5 }, true)).toEqual({
      ok: false,
      message: IMAGE_REFUSED_MESSAGE,
    });
    expect(checkUpload({ name: "a.gif", type: "image/gif", size: 5 }, true)).toMatchObject({ ok: true });
  });
});

describe("safeFileName", () => {
  it("keeps a readable base and uses the extension of the type", () => {
    expect(safeFileName("My Report (Final).PDF", "application/pdf")).toBe("my-report-final.pdf");
    expect(safeFileName("Café photo.jpeg", "image/jpeg")).toBe("cafe-photo.jpg");
    expect(safeFileName("../../etc/passwd.png", "image/png")).toBe("etc-passwd.png");
    expect(safeFileName("...", "image/webp")).toBe("file.webp");
  });
});

describe("checkTokenRequest (upload route)", () => {
  const prefix = "site/media/";
  const claim = (contentType: string, size = 1000) => JSON.stringify({ contentType, size });

  it("accepts one safe name under the media prefix with a matching claim", () => {
    expect(checkTokenRequest("site/media/photo.jpg", claim("image/jpeg"), prefix)).toEqual({ ok: true, contentType: "image/jpeg" });
    expect(checkTokenRequest("site/media/record.docx", claim(DOCX_TYPE), prefix)).toMatchObject({ ok: true });
  });

  it("refuses paths outside the prefix, nested or unsafe names, and wrong or missing claims", () => {
    for (const [pathname, payload] of [
      ["other/media/photo.jpg", claim("image/jpeg")],
      ["site/photo.jpg", claim("image/jpeg")],
      ["site/media/../published.json", claim("image/jpeg")],
      ["site/media/sub/photo.jpg", claim("image/jpeg")],
      ["site/media/logo.svg", claim("image/svg+xml")],
      ["site/media/tool.exe", claim("application/x-msdownload")],
      ["site/media/photo.jpg", claim("image/png")],
      ["site/media/photo.jpg", claim("image/jpeg", MAX_UPLOAD_BYTES + 1)],
      ["site/media/photo.jpg", null],
      ["site/media/photo.jpg", "not json"],
    ] as const) {
      expect(checkTokenRequest(pathname, payload, prefix)).toEqual({ ok: false, message: UPLOAD_REFUSED_MESSAGE });
    }
  });
});
