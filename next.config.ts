import type { NextConfig } from "next";
import { imageHostsFromEnv } from "./src/components/site/image-hosts";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Only the exact Blob store host names from BLOB_PUBLIC_HOSTNAMES, no
    // wildcard. An image on any other host is shown unoptimized (MediaImage).
    remotePatterns: imageHostsFromEnv().map((hostname) => ({
      protocol: "https" as const,
      hostname,
      port: "",
      pathname: "/**",
      search: "",
    })),
  },
};

export default nextConfig;
