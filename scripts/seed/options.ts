import {
  blobCredentialsFromEnv,
  contentConfigFromEnv,
  docsCredentialsFromEnv,
  type BlobCredentials,
  type ContentConfig,
} from "../../src/lib/content/store";

// The options of scripts/seed.ts and the stores they choose, as pure functions
// so the tests can check them. The PRODUCTION run takes every value from the
// environment of that one run: an env file holds the development values (the
// development CONTENT_PATH_SECRET), and the Production draft must never be
// written under them.

export type SeedStore = "dev" | "production";

export interface SeedOptions {
  force: boolean;
  check: boolean;
  envFile: string | undefined;
  store: SeedStore;
}

export function parseSeedArgs(argv: string[]): SeedOptions {
  const options: SeedOptions = { force: false, check: false, envFile: undefined, store: "dev" };
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--check") options.check = true;
    else if (arg.startsWith("--env-file=")) options.envFile = arg.slice("--env-file=".length);
    else if (arg === "--store=dev" || arg === "--store=production") options.store = arg.slice("--store=".length) as SeedStore;
    else throw new Error(`Unknown option: ${arg}. Use --check, --force, --store=dev|production, or --env-file=<path>.`);
  }
  if (options.store === "production" && options.envFile !== undefined) {
    throw new Error("--store=production takes its values from the environment only; do not pass --env-file");
  }
  return options;
}

export interface SeedTargets {
  /** The public media store, for the images and files. */
  media: BlobCredentials;
  /** The private documents store, for the draft. */
  docs: BlobCredentials;
  /** CONTENT_ROOT and CONTENT_PATH_SECRET, from the same environment as the stores. */
  config: ContentConfig;
}

/**
 * The stores and the content config for one seed run, all from one environment
 * object. VERCEL_ENV is set from --store, so --store=dev can never choose a
 * Production store, whatever the environment says.
 */
export function seedTargets(options: SeedOptions, env: Record<string, string | undefined>): SeedTargets {
  const production = options.store === "production";
  if (production) {
    const missing = ["CONTENT_ROOT", "CONTENT_PATH_SECRET"].filter((name) => !env[name]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `--store=production needs ${missing.join(" and ")} set in the environment of this run, with the Production values.`,
      );
    }
  }
  const storeEnv: Record<string, string | undefined> = { ...env, VERCEL_ENV: production ? "production" : undefined };
  const media = blobCredentialsFromEnv(storeEnv);
  const docs = docsCredentialsFromEnv(storeEnv);
  if (!media || !docs) {
    const [m, d] = production ? ["BLOB", "DOCS"] : ["DEV", "DEVDOCS"];
    throw new Error(`${m}_STORE_ID and ${d}_STORE_ID (or their _READ_WRITE_TOKEN) must be set for --store=${options.store}.`);
  }
  if (("storeId" in media || "storeId" in docs) && !storeEnv.VERCEL_OIDC_TOKEN?.trim()) {
    throw new Error("VERCEL_OIDC_TOKEN must be set to use a store ID. Run `vercel env pull` again; the token lasts about 12 hours.");
  }
  return { media, docs, config: contentConfigFromEnv(storeEnv) };
}
