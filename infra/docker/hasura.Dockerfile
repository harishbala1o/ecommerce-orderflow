# Bakes the versioned migrations + metadata into the cli-migrations image so the
# engine self-applies them on boot in environments without host bind mounts (k8s).
# Build context is the repo root.
FROM hasura/graphql-engine:v2.42.0.cli-migrations-v3

COPY hasura/migrations /hasura-migrations
COPY hasura/metadata /hasura-metadata
