// Deliberately .mjs, not .ts.
//
// Next compiles a TypeScript config into a temporary module before reading it,
// and that step needs SWC. On a build host whose glibc predates 2.29 the
// native SWC binary cannot load, Next falls back to its WASM build, and the
// config compilation breaks with ERR_MODULE_NOT_FOUND on a temp file. Plain
// JavaScript is read directly, so there is nothing to compile.

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Standalone output is what keeps the Docker image small on the VPS, but on
  // a managed host it fights `next start`, which expects the normal output.
  // The Dockerfile sets DOCKER_BUILD=1; nothing else does.
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
