import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small on the VPS.
  output: "standalone",
  // pg must stay a real Node dependency, never bundled for the browser.
  serverExternalPackages: ["pg", "@node-rs/argon2"],
};

export default nextConfig;
