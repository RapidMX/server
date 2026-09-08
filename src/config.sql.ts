///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import nconf from "nconf";
import { DEFAULT_AUTH_SECRET, DEFAULT_COOKIE_SECRET, DEFAULT_GIPHY_API_KEY, DEFAULT_MAIL_INGEST_SECRET } from "./config.defaults.js";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const _require = createRequire(import.meta.url);
const packageInfo = _require(join(process.cwd(), "package.json"));

const conf = nconf
    .argv()
    .env({
        separator: "__",
        parseValues: true,
    });

conf.use("memory");

conf.defaults({
    service_name: packageInfo.name,
    version: packageInfo.version,
    base_path: join(_dirname, "sql"),
    cookie_secret: DEFAULT_COOKIE_SECRET,
    cors: {
        origins: ["http://localhost:3000"],
    },
    datastores: {
        acl: {
            type: "postgres",
            host: "localhost",
            database: "rrst_acls",
            synchronize: true,
        },
        cache: {
            type: "redis",
            url: "redis://localhost",
        },
        events: {
            type: "redis",
            url: "redis://localhost"
        },
        logs: {
            type: "redis",
            url: "redis://localhost"
        },
        sql: {
            type: "postgres",
            host: "localhost",
            database: "rrst_auth",
            synchronize: true,
        },
    },
    class_loader: {
        ignore: [
            /server\..*/,
            /config\..*/
        ]
    },
    // Specifies the group names that are considered to be trusted with administrative privileges.
    trusted_roles: ["admin"],
    react: {
        // Path to the Vite manifest produced by `rapidrest build`, used to resolve hashed
        // client bundle URLs for hydrated pages (see apps/www, apps/admin).
        manifestPath: "dist/public/.vite/manifest.json",
    },
    // Settings pertaining to the VERIFICATION of authentication tokens issued by the separate `auth-server`
    // deployment (see `.claude/NOTES.md`). This service never issues its own JWTs and mounts no sign-in/
    // sign-up/session routes of its own — `auth:secret` must match auth-server's own signing secret exactly.
    auth: {
        // The authentication strategy used to verify incoming JWTs.
        strategy: "auth.JWTStrategy",
        allowQueryParam: true,
        // The password used to verify authentication tokens. Must match auth-server's own `auth:secret`.
        secret: DEFAULT_AUTH_SECRET,
        // Lets `apps/www`/`apps/admin`'s SSR pages read `req.user` from the `jwt` cookie auth-server sets,
        // without the browser having to attach an Authorization header itself. auth-server and mail-server
        // must be deployed under a shared cookie domain (a Helm-chart-level concern, not configured here)
        // for this to actually work across the two services.
        cookie: {
            enabled: true,
            access: { name: "jwt" },
        },
        options: {
            audience: "mydomain.com",
            issuer: "api.mydomain.com",
        },
    },
    // The externally-deployed auth-server's base URL — the webmail/admin frontends redirect an
    // unauthenticated visitor here to sign in, then back with a valid session.
    mail: {
        auth_server_url: "http://localhost:3001",
        auto_provision: {
            enabled: true,
            quota_bytes: 5_000_000_000,
            timeout_ms: 10_000
        },
        blob: {
            local: {
                // Local filesystem root for raw MIME sources, sanitized HTML, attachment binaries, extracted
                // attachment text, and contact photos (see `LocalFsBlobStore`). Must be a persistent volume
                // in any real deployment.
                root: "./data/blobs",
            },
        },
        search: {
            postgres: {
                datasource: "sql",
            },
        },
        scan: {
            spam: {
                rspamd: {
                    url: "http://rspamd:11333",
                },
            },
            av: {
                clamav: {
                    host: "clamav",
                    port: 3310,
                },
            },
        },
        transport: {
            // The internal MTA (Postfix) hand-off contract's bearer secret (see `BaseMailIngestRoute`,
            // mounted at `/internal/mta`). Must match whatever secret Postfix's content-filter/recipient-
            // validation hooks are configured to send.
            ingest: {
                secret: DEFAULT_MAIL_INGEST_SECRET,
            },
        },
    },
    giphy: {
        api_key: DEFAULT_GIPHY_API_KEY,
    },
    cluster_url: "http://localhost",
    metrics: {
        authRequired: true,
    },
    // Exact IP addresses of proxies/load balancers this server sits behind and trusts to set
    // X-Forwarded-For/X-Real-IP truthfully. Left empty by default (fail closed: forwarding headers are
    // ignored and NetUtils.getIPAddress() falls back to the socket's own remote address), which is safe
    // but means per-IP rate limiting and audit-log IPs will all collapse onto the proxy's own address in
    // any deployment that actually sits behind one (the common case in production). Set this to your
    // reverse proxy/load balancer's IP(s) if you deploy behind one.
    trusted_proxies: [],
});

export default conf;
