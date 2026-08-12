#!/bin/bash
# Runs only when the Postgres data directory is first initialised. The inventory
# bounded context gets its own database: PostgreSQL cannot join or transact
# across databases, so the boundary is enforced by the engine, not by convention.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE ${POSTGRES_DB}_inventory;
SQL
