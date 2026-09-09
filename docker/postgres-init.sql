-- Runs once, only on a brand-new postgres data volume (see the official postgres image's
-- /docker-entrypoint-initdb.d/ convention) — creates the two separate databases the SQL compose stack
-- needs so `server` and `auth-server` never share tables in the same database. Each app's own `acl` and
-- `sql`/`mongo` datastores are still colocated within that one app-scoped database (matching this
-- project's existing single-database-per-app convention — see docker-compose.sql.yml).
CREATE DATABASE rapidmx_server;
CREATE DATABASE rapidmx_auth;
