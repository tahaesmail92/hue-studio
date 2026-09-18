import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is what keeps the Docker image small on the VPS, but on
  // Vercel it is unnecessary and fights the platform's own build output. The
  // Dockerfiles set DOCKER_BUILD=1; Vercel does not.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // pg must stay a real Node dependency, never bundled for the browser.
  serverExternalPackages: ["pg", "@node-rs/argon2"],
  // The PDF routes read these off disk at request time, so tracing has to be
  // told about them - otherwise Arabic renders as boxes in production only.
  outputFileTracingIncludes: {
    "/api/shoots/**": ["./lib/pdf/fonts/**"],
  },
};

export default nextConfig;
