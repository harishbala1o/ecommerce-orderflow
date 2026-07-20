import type { CodegenConfig } from "@graphql-codegen/cli";

// Introspects the local dev Hasura (admin secret is the dev placeholder from
// .env.example). Run with the stack up: `pnpm --filter @ecommerce-orderflow/graphql-client codegen`.
// Generated output is committed so builds never require a live endpoint.
const config: CodegenConfig = {
  schema: [
    {
      "http://localhost:8080/v1/graphql": {
        headers: { "x-hasura-admin-secret": process.env.HASURA_GRAPHQL_ADMIN_SECRET ?? "ecommerce_orderflow_dev_admin_secret" },
      },
    },
  ],
  documents: ["src/operations/**/*.graphql"],
  generates: {
    "src/gql/": {
      preset: "client",
      config: {
        scalars: { uuid: "string", timestamptz: "string", numeric: "number" },
        documentMode: "string",
      },
    },
  },
};

export default config;
