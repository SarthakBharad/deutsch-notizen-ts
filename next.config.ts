import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is generated from notes.json at build time; there is no server
  // work at request time, so the whole site can be emitted as static files.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
