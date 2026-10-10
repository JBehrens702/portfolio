// Seeds the draft from the Google Site copy in content/seed/ (U7).
//
// Usage, in the dev-env container, from the repo root:
//   npm run seed -- --check                    validate the seed only; needs no env vars
//   npm run seed -- --env-file=.env.local      upload the media and write the draft
//                                              into the DEVELOPMENT store
//   npm run seed -- --env-file=.env.local --force   overwrite an existing draft
//   npm run seed -- --store=production         seed the PRODUCTION store (U8 only);
//       pass the Production store's credentials, CONTENT_ROOT, and the Production
//       CONTENT_PATH_SECRET as env vars for this one run - never put them in a file.
//       --env-file is refused here: it holds the development values.
//
// Media go to the public media store (DEV_STORE_ID, or BLOB_STORE_ID on
// Production); the draft goes to the private documents store (DEVDOCS_STORE_ID,
// or DOCS_STORE_ID on Production). Each may use a _READ_WRITE_TOKEN instead. A store ID needs VERCEL_OIDC_TOKEN, which
// `vercel env pull` writes. It also reads CONTENT_ROOT and CONTENT_PATH_SECRET from the
// environment (or, for the development store only, from the --env-file). It writes only the draft, never the
// published document, and it never prints or saves the token or the secret.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { createBlobContentStore } from "../src/lib/content/store";
import { DraftExistsError, checkSeed, seedDraft, type ManifestEntry, type Uploader } from "./seed/core";
import { parseSeedArgs, seedTargets } from "./seed/options";

const SEED_DIR = path.resolve("content/seed");

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(SEED_DIR, file), "utf8"));
}

async function main(): Promise<void> {
  const options = parseSeedArgs(process.argv.slice(2));
  const input = await readJson("site.json");
  const manifest = (await readJson("media/manifest.json")) as ManifestEntry[];

  if (options.check) {
    const site = checkSeed(input, manifest);
    console.log(`The seed is valid: ${site.experiences.length} experiences, ${manifest.length} media files.`);
    return;
  }

  // parseSeedArgs refuses --env-file with --store=production.
  if (options.envFile) process.loadEnvFile(options.envFile);
  // Images and files go to the public media store; the draft goes to the private
  // documents store. The stores and the content config come from one environment.
  const { media: credentials, docs: docsCredentials, config } = seedTargets(options, process.env);
  console.log(`Seeding the ${options.store === "production" ? "PRODUCTION" : "development"} store.`);
  const store = createBlobContentStore(config, { credentials: docsCredentials });

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
