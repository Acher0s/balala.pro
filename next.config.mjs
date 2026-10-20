/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Small self-contained server for the Docker image.
  output: "standalone",
  // Native/WASM database drivers must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default config;
