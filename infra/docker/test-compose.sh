#!/usr/bin/env bash
# Thin wrapper around docker compose for the isolated test stack, so the long
# project/env/file flags live in one place and cannot be mistyped or (in zsh)
# mangled by storing them in a shell variable.
exec docker compose -p orderflow-test --env-file .env.test \
  -f infra/docker/compose.yaml -f infra/docker/compose.test.yaml "$@"
