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
  transpilePackages: ["@ecommerce-orderflow/domain", "@ecommerce-orderflow/graphql-client"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
