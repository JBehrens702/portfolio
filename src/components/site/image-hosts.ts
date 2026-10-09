// The Blob host names that next/image may optimize. next.config.ts and the
// image component both read them, so the allow-list has one source.
// BLOB_PUBLIC_HOSTNAMES is a comma-separated list of exact host names, such as
// "abc123.public.blob.vercel-storage.com". Wildcards are refused.

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function parseImageHosts(value: string | undefined): string[] {
  const hosts = (value ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
  for (const host of hosts) {
    if (!HOSTNAME.test(host)) {
      throw new Error(`BLOB_PUBLIC_HOSTNAMES must list exact host names, without wildcards or "https://": "${host}"`);
    }
  }
  return hosts;
}

/** The allowed hosts from the environment. */
export function imageHostsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  return parseImageHosts(env.BLOB_PUBLIC_HOSTNAMES);
}

/** True when next/image may optimize the image: an https address on an allowed host. */
export function isOptimizableImage(url: string, hosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && hosts.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
