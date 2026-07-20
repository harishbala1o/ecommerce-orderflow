/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ecommerce-orderflow/domain", "@ecommerce-orderflow/graphql-client"],
};

export default nextConfig;
