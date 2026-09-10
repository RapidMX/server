# RapidMX: Mail Server

[![CI](https://github.com/rapidmx/server/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/rapidmx/server/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/rapidmx/server/badge.svg?branch=main)](https://coveralls.io/github/rapidmx/server?branch=main)
[![npm version](https://img.shields.io/npm/v/@rapidmx/server)](https://www.npmjs.com/package/@rapidmx/server)

A reference implementation of a RapidMX mail server, providing a complete, deployable mail service that includes a web mail (React) client as well as Exchange ActiveSync, and MAPI support.

### Key Features

* Web Mail
* Exchange ActiveSync
* MAPI over HTTP
* Autodiscover

## Getting Started

To get started using this service first clone the source. It is highly recommended that you fork the project first.

```bash
git clone https://github.com/rapidmx/server
```

## Deployment

| Docker Image |                       |
| ------------ | :-------------------: |
| Registry     | ghcr.io |
| Repository   | /rapidmx/server |
| Tag          | 1.0.0 |

This project provides scripts for running in Docker or Kubernetes. For Docker, you will find *docker-compose* scripts
in the project source. For Kubernetes, a *helm* chart is available both in the project source and via GitHub Container
Registry (ghcr.io).

### Docker Compose

Pick `docker-compose.mongo.yml` or `docker-compose.sql.yml` depending on which datastore backend you want
(MongoDB or PostgreSQL) — there is no plain `docker-compose.yml`. Either one, on its own, brings up the
*entire* stack: this service, the separate [`auth-server`](https://github.com/rapidrest/auth-server)
deployment it verifies JWTs against, the mail-flow stack (Postfix, rspamd for spam scoring/DKIM signing,
ClamAV), and the `mta-bridge` service that lets Postfix's own recipient/domain lookups and final delivery
talk to this app's `/internal/mta` contract.

```bash
docker compose -f docker-compose.mongo.yml up -d --build
```

`auth-server`'s image (`ghcr.io/rapidrest/auth-server`) is pulled from GHCR, not built locally.

For anything beyond local evaluation, override these in a `.env` file next to the compose files (every one
of them defaults to an insecure, publicly-known placeholder value otherwise — see `src/config.defaults.ts`):

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | JWT signing secret — must match between this service and `auth-server` exactly |
| `AUTH_AUDIENCE` / `AUTH_ISSUER` | JWT `aud`/`iss` claims — must also match `auth-server` |
| `AUTH_SERVER_PUBLIC_URL` | Browser-facing base URL of `auth-server` (defaults to `http://localhost:3001`, dev/single-host only) |
| `COOKIE_SECRET` | Shared cookie-signing secret |
| `MAIL_INGEST_SECRET` | Bearer secret authenticating `mta-bridge`'s calls to this app's `/internal/mta` routes |
| `MAIL_DOMAINS` | Comma-separated domains Postfix accepts *outbound* submissions for (`ALLOWED_SENDER_DOMAINS`) — keep in sync with the `Domain`s added via the admin console |
| `DKIM_AUTOGENERATE` / `DKIM_SELECTOR` | DKIM key handling — see `docker-compose.mail.yml`'s own comments for how this interacts with the app's own automatic per-`Domain` key generation |

The `dkim_rspamd_keys`/`dkim_opendkim_keys`/`mongo_data`/`postgres_data`/`blob_data` named volumes persist
DKIM keys, database contents, and message/attachment storage across `docker compose down`/`up` — don't
remove them (`docker compose down -v`) unless you actually want to start over.

### Kubernetes

A complete Helm chart is included for convenience to deploy and run on a Kubernetes cluster. Deployment to Kubernetes
is easy using either the published helm chart in GitHub or install from the helm chart locally.

#### From GHCR

```bash
helm install --create-namespace --namespace mail-server mail-server oci://ghcr.io/rapidrest/charts/mail-server --version 1.0.0
```

#### From Local

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dep up ./helm
helm install --create-namespace --namespace mail-server mail-server ./helm
```

#### Single Node Cluster

If you would like to run the project in a single-node Kubernetes cluster, the `single_node_install.sh` script is a
great way to get started. This script will automatically set up everything needed to run *server* in a Kubernetes
environment, including ingress with TLS support. Simply run the script from any linux compatible machine.

```bash
./single_node_install.sh
```

## Debugging

[Visual Studio Code](https://code.visualstudio.com/) is the recommended IDE to develop with. The project includes workspace and launch configuration files out of the box.

To debug while running via Docker Compose select the `Docker: Attach Debugger` configuration and hit the `F5` key. If you want to run the server directly and debug choose the `Launch Server` configuration.