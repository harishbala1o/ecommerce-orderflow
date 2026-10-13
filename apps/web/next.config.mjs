// Baseline security headers. A full Content-Security-Policy is intentionally
// deferred (M5): getting it right across Next.js HMR, the Keycloak redirect,
// and the urql fetch to Hasura needs care, and a wrong CSP silently breaks the
// app. These headers are safe and unconditional.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The test-stack dev server builds into its own directory. `next build` and
  // `next dev` otherwise share .next, so running a production build while a dev
  // server is up overwrites the chunks it is serving and every route starts
  // failing with MODULE_NOT_FOUND until .next is deleted.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@ecommerce-orderflow/domain", "@ecommerce-orderflow/graphql-client"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
