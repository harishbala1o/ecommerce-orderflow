import type { CodegenConfig } from "@graphql-codegen/cli";

// Introspects the local dev Hasura. Run with the stack up and the admin secret
// exported, e.g.:
//   HASURA_GRAPHQL_ADMIN_SECRET=$(grep '^HASURA_GRAPHQL_ADMIN_SECRET' ../../.env | cut -d= -f2) \
//     pnpm --filter @ecommerce-orderflow/graphql-client codegen
// Generated output is committed, so builds never require a live endpoint.
const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
if (!adminSecret) {
  throw new Error(
    "HASURA_GRAPHQL_ADMIN_SECRET must be set to run codegen (do not hardcode secrets).",
  );
}

const config: CodegenConfig = {
  schema: [
    {
      "http://localhost:8080/v1/graphql": {
        headers: { "x-hasura-admin-secret": adminSecret },
      },
    },
  ],
  documents: ["src/operations/**/*.graphql"],
  generates: {
    "src/gql/": {
      preset: "client",
      config: {
        scalars: { uuid: "string", timestamptz: "string", numeric: "number" },
      },
    },
  },
};

export default config;
