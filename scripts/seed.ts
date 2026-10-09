// Seeds the draft from the Google Site copy in content/seed/ (U7).
//
// Usage, in the dev-env container, from the repo root:
//   npm run seed -- --check                    validate the seed only; needs no env vars
//   npm run seed -- --env-file=.env.local      upload the media and write the draft
//                                              into the DEVELOPMENT store
//   npm run seed -- --env-file=.env.local --force   overwrite an existing draft
//   npm run seed -- --store=production         seed the PRODUCTION store (U8 only);
//       pass the Production store's credentials and the Production
//       CONTENT_PATH_SECRET as env vars for this one run - never put them in a file
//
// Media go to the public media store (DEV_STORE_ID, or BLOB_STORE_ID on
// Production); the draft goes to the private documents store (DEVDOCS_STORE_ID,
// or DOCS_STORE_ID on Production). Each may use a _READ_WRITE_TOKEN instead. A store ID needs VERCEL_OIDC_TOKEN, which
// `vercel env pull` writes. It also reads CONTENT_ROOT and CONTENT_PATH_SECRET from the
// environment (or from the --env-file). It writes only the draft, never the
// published document, and it never prints or saves the token or the secret.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { blobCredentialsFromEnv, contentConfigFromEnv, createBlobContentStore, docsCredentialsFromEnv } from "../src/lib/content/store";
import { DraftExistsError, checkSeed, seedDraft, type ManifestEntry, type Uploader } from "./seed/core";

const SEED_DIR = path.resolve("content/seed");

function parseArgs(argv: string[]) {
  const options = { force: false, check: false, envFile: undefined as string | undefined, store: "dev" as "dev" | "production" };
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--check") options.check = true;
    else if (arg.startsWith("--env-file=")) options.envFile = arg.slice("--env-file=".length);
    else if (arg === "--store=dev" || arg === "--store=production") options.store = arg.slice("--store=".length) as "dev" | "production";
    else throw new Error(`Unknown option: ${arg}. Use --check, --force, --store=dev|production, or --env-file=<path>.`);
  }
  return options;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(SEED_DIR, file), "utf8"));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const input = await readJson("site.json");
  const manifest = (await readJson("media/manifest.json")) as ManifestEntry[];

  if (options.check) {
    const site = checkSeed(input, manifest);
    console.log(`The seed is valid: ${site.experiences.length} experiences, ${manifest.length} media files.`);
    return;
  }

  if (options.envFile) process.loadEnvFile(options.envFile);
  const storeEnv = { ...process.env, VERCEL_ENV: options.store === "production" ? "production" : undefined };
  // Images and files go to the public media store; the draft goes to the private documents store.
  const credentials = blobCredentialsFromEnv(storeEnv);
  const docsCredentials = docsCredentialsFromEnv(storeEnv);
  if (!credentials || !docsCredentials) {
    const [media, docs] = options.store === "production" ? ["BLOB", "DOCS"] : ["DEV", "DEVDOCS"];
    throw new Error(`${media}_STORE_ID and ${docs}_STORE_ID (or their _READ_WRITE_TOKEN) must be set for --store=${options.store}.`);
  }
  if (("storeId" in credentials || "storeId" in docsCredentials) && !process.env.VERCEL_OIDC_TOKEN?.trim()) {
    throw new Error("VERCEL_OIDC_TOKEN must be set to use a store ID. Run `vercel env pull` again; the token lasts about 12 hours.");
  }
  console.log(`Seeding the ${options.store === "production" ? "PRODUCTION" : "development"} store.`);
  const config = contentConfigFromEnv();
  const store = createBlobContentStore(config, { credentials: docsCredentials, access: "private" });

  const upload: Uploader = async ({ pathname, contentType, data }) => {
    const blob = await put(pathname, Buffer.from(data), { access: "public", addRandomSuffix: true, contentType, ...credentials });
    return { url: blob.url, pathname: blob.pathname };
  };

  const { uploaded } = await seedDraft({
    input,
    manifest,
    readMedia: (file) => readFile(path.join(SEED_DIR, "media", file)),
    upload,
    store,
    force: options.force,
    log: (line) => console.log(line),
  });
  console.log(`Done: ${uploaded} media files uploaded and the draft written under CONTENT_ROOT "${config.root}".`);
  console.log("The published document was not changed. Open the preview to check the draft.");
}

/** Removes the token and the secret path segment from a message. */
function redact(message: string): string {
  let text = message;
  for (const name of ["BLOB_READ_WRITE_TOKEN", "DEV_READ_WRITE_TOKEN", "VERCEL_OIDC_TOKEN", "CONTENT_PATH_SECRET"]) {
    const value = process.env[name]?.trim();
    if (value) text = text.split(value).join(`<${name}>`);
  }
  return text;
}

main().catch((error: unknown) => {
  if (error instanceof DraftExistsError) {
    console.error(error.message);
  } else {
    console.error(`Seed failed: ${redact(error instanceof Error ? error.message : String(error))}`);
  }
  process.exitCode = 1;
});
