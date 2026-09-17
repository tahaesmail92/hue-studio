import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small on the VPS.
  output: "standalone",
  // pg must stay a real Node dependency, never bundled for the browser.
  serverExternalPackages: ["pg", "@node-rs/argon2"],
  // The PDF routes read these off disk at request time, so tracing has to be
  // told about them - otherwise Arabic renders as boxes in production only.
  outputFileTracingIncludes: {
    "/api/shoots/**": ["./lib/pdf/fonts/**"],
  },
};

export default nextConfig;
