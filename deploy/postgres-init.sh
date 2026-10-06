#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
    --set=owner_password="$MIGRATION_PASSWORD" --set=runtime_password="$DATABASE_PASSWORD" <<'SQL'
CREATE ROLE bugboard_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE bugboard_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOBYPASSRLS;
ALTER DATABASE bugboard26 OWNER TO bugboard_owner;
ALTER SCHEMA public OWNER TO bugboard_owner;
SQL
