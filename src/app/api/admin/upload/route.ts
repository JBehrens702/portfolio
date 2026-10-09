import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { getOwnerCheck, refusalResponse } from "@/lib/auth/owner";
import { blobCredentialsFromEnv, contentConfigFromEnv, contentPaths, isProduction } from "@/lib/content/store";
import { MAX_UPLOAD_BYTES, checkTokenRequest } from "@/lib/content/upload-rules";

// The upload route (U6 step 3, 2.4.3, KTD2). The browser asks here for a
// presigned upload URL, then uploads the file straight to Blob. The route
// checks the owner, allows only one safe file name under the content root's
// media prefix, only JPEG, PNG, WebP, GIF, PDF, and DOCX, and at most 25 MB,
// and makes Blob add a random suffix to the pathname, so an unpublished file
// has no guessable address.
//
// The presigned flow works with this environment's store ID and Vercel's OIDC
// token as well as with a read-write token (blobCredentialsFromEnv), so the
// Production store is used only on Production. `vercel env pull` writes the
// read-write token as an empty value, so local work has only the store ID.
//
// There is no upload-completed callback: the proxy refuses Vercel's sessionless
// callback, and the callback cannot reach a local server. The browser saves the
// returned file information into the draft with a server action instead.

const NO_STORE = { "cache-control": "no-store" };

/** How long a presigned upload URL stays valid. */
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

class UploadRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 = 400,
  ) {
    super(message);
  }
}

/**
 * handleUploadPresigned needs a webhook key even when no callback is used. This
 * route refuses every callback before handleUploadPresigned runs, so the key
 * is never used to accept one.
 */
function webhookKeyFromEnv(env: Record<string, string | undefined> = process.env): string {
  const prefix = isProduction(env) ? "BLOB" : "DEV";
  return env[`${prefix}_WEBHOOK_PUBLIC_KEY`]?.trim() || "unused: this route accepts no upload callbacks";
}

export async function POST(request: Request): Promise<Response> {
  const check = await getOwnerCheck();
  if (!check.ok) return refusalResponse(check);

  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return json({ error: "The request body is not JSON." }, 400);
  }
  if (body?.type !== "blob.generate-presigned-url") {
    return json({ error: "Only upload URL requests are accepted." }, 400);
  }

  const credentials = blobCredentialsFromEnv();
  if (!credentials) {
    return json({ error: "No Blob store is configured for this environment." }, 503);
  }
  const { mediaPrefix } = contentPaths(contentConfigFromEnv());

  try {
    const result = await handleUploadPresigned({
      request,
      body,
      webhookPublicKey: webhookKeyFromEnv(),
      getSignedToken: async (pathname, clientPayload) => {
        // Check the owner again, as close to the upload URL as possible.
        const again = await getOwnerCheck();
        if (!again.ok) throw new UploadRefused(again.reason, 403);
        const rules = checkTokenRequest(pathname, clientPayload, mediaPrefix);
        if (!rules.ok) throw new UploadRefused(rules.message);
        const limits = { allowedContentTypes: [rules.contentType], maximumSizeInBytes: MAX_UPLOAD_BYTES };
        const token = await issueSignedToken({
          ...credentials,
          pathname,
          operations: ["put"],
          validUntil: Date.now() + UPLOAD_WINDOW_MS,
          ...limits,
        });
        return { token, urlOptions: { ...limits, addRandomSuffix: true, allowOverwrite: false } };
      },
    });
    return json(result, 200);
  } catch (error) {
    if (error instanceof UploadRefused) return json({ error: error.message }, error.status);
    throw error;
  }
}
