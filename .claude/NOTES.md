# Code review notes — rapidrest/mail-server

This file exists so that Claude sessions working in this repo don't re-litigate settled
decisions or re-discover the same issues from scratch. It is local to this repo (not tied to
any one machine's global Claude memory), so it travels with the code.

**Maintenance rule:** when a standing decision changes, update the section below in place
(don't just append a contradiction lower down). When a new investigation/session produces a
decision, finding, or reverted approach worth remembering, add a dated entry under Session Log.
Keep entries terse — this is a reference, not a transcript.

## Standing decisions

- **Commit discipline.** Don't `git commit` unless explicitly asked, even after a full
  review-and-fix cycle with passing tests. Leave changes staged/unstaged and say so.
- **Commit message style: concise, one line per task/bug/feature — no verbose prose.** A commit
  message is a short list of one-line bullets, one per item. Never a paragraph explaining what was
  done or why for any single item — that belongs in the diff/code comments/NOTES.md, not the commit
  message. This mirrors JP's standing convention across his other repos.
- **This is a monorepo checkout, not isolated packages.** `mail-server` sits alongside its own
  `@rapidrest/*` dependencies as sibling directories under `d:\github\rapidrest\`: `mail`,
  `core`, `react`, `service-core`, `cli`. All are owned by the same author (Jean-Philippe
  Steinmetz) as `mail-server` itself. When a bug traces into one of these packages, fix it at
  the source in the sibling repo rather than working around it only in `mail-server` — these
  aren't third-party deps you can't touch.
- **Never bump a `package.json` `version` field, in this repo or any sibling `@rapidrest/*` repo,
  and never publish/`npm publish` one.** JP has a formal release process for that (see e.g.
  `mail-server`'s own `"version"`/`"postversion"` npm-lifecycle scripts, which sync the Helm
  chart/README and push tags — a manual version edit bypasses all of that and produces conflicts).
  This applies even when a fix in a sibling repo is otherwise done and verified: land the source
  fix, leave the version field alone, and tell JP it's ready for him to version/publish himself.
  Once he publishes, bump *this* repo's dependency constraint (e.g. `"@rapidrest/auth": "^X.Y.Z"`)
  to the version he actually published — that part is fine, since it's just declaring what this
  repo needs, not deciding a sibling repo's own release number.
- `@rapidrest/react` is consumed from the npm registry (not a workspace/portal link), so a
  source fix in the sibling `react` repo does **not** automatically reach `mail-server`'s
  `node_modules`. For an immediate fix ahead of a real publish, `yarn patch`/`yarn patch-commit`
  the installed copy rather than bumping any version field (`^1.0.1` currently does **not** need a
  patch — see Session Log 2026-08-22).
- **Update (2026-09-06, rapidmx split): `@rapidmx/restapi` is now published to npm (`0.1.0`) and
  this repo (`@rapidmx/server`, the post-split successor to `mail-server`) consumes it as a plain
  registry dependency (`"@rapidmx/restapi": "^0.1.0"`) — not `portal:`, not `yarn patch`.** This
  sidesteps the dual-module-instance problem below entirely, since a real npm-installed package has
  no bundled `devDependencies`/`node_modules` to shadow the consumer's copies of
  `@rapidrest/core`/`@rapidrest/service-core`. The `portal:`-is-broken finding below still applies
  in full to `@rapidmx/activesync`/`@rapidmx/autodiscover`/`@rapidmx/mapi`, which remain
  `portal:../X` links in this repo (not yet published) — currently harmless only because nothing in
  `server`'s `src`/`apps`/`test` imports from them yet. The moment any of them is actually wired in,
  re-check for the same failure mode this caused for `restapi` (see the new Session Log entry below
  for how subtle/silent it can be — it does not surface as a resolution error, it surfaces as a real
  network call inside what should be a fully-mocked test).
- **`@rapidmx/restapi` must also be consumed via `yarn patch`/`yarn patch-commit`, never
  `portal:../mail` — confirmed broken, not just "unconventional."** `@rapidmx/restapi` declares
  `@rapidrest/core`/`@rapidrest/service-core` as `peerDependencies` but *also* has its own
  `devDependencies` copies (needed to build/test itself standalone) physically installed in its
  own `node_modules`. `mail` and `mail-server` are sibling directories, not Yarn workspace
  members, so a `portal:` link just symlinks mail's entire directory tree *including that private
  node_modules* — Node's resolution from inside the symlinked package then finds mail's own
  private `@rapidrest/service-core`/`@rapidrest/core` copy first, a *different physical module
  instance* than mail-server's. Confirmed via direct reproduction: every `@rapidmx/restapi`-derived
  route class (Mailbox, Folder, Message, etc.) registered as a known class but silently never
  mounted a single HTTP method — the decorator/`instanceof` machinery `RouteUtils` relies on to
  find `@Get`/`@Post`-decorated methods breaks across the two module instances. Routes with zero
  `@rapidmx/restapi` imports (e.g. a `BaseACLRoute` subclass using only `@rapidrest/service-core`)
  mounted fine, which is what isolated the cause. `yarn patch` avoids this because the patched
  package stays *inside* mail-server's own already-deduped `node_modules/@rapidmx/restapi`, so it
  resolves `@rapidrest/service-core`/`@rapidrest/core` from mail-server's own top-level
  `node_modules` exactly like the real npm-published package would. Workflow used (repeat whenever
  further local `mail` changes need testing here ahead of a real publish): build `mail` (`yarn
  build` in `d:\github\rapidrest\mail`), `yarn patch @rapidmx/restapi` in `mail-server` to get an
  extracted temp dir, replace that dir's `dist/` wholesale with `mail`'s freshly-built `dist/`
  (`package.json` doesn't need changes — verified identical to the published 0.2.0's), then `yarn
  patch-commit -s <tmpdir>`. `yarn install` afterward should show no `--preserve-symlinks`
  warning — if it does, something is still portal/link-based and will hit this same bug.
- `test/Server.mongo.test.ts`/`test/Server.sql.test.ts` build their own `ObjectFactory`/`Server`
  directly from `config.mongo.ts`/`config.sql.ts` rather than importing `server.mongo.ts`/
  `server.sql.ts` — any DI provider registered via `objectFactory.register(Class, "Token")` in
  those scripts (the `@rapidmx/restapi` `BlobStore`/`SearchProvider`/`SpamScanProvider`/
  `AvScanProvider`/`MailTransport` string-token injections — see below) must be registered a
  second time in these two test files too, or any route touching them throws `No class found with
  name: <Token>` the moment the test tries to instantiate it.
- TypeORM 1.x dropped the plain `"sqlite"` driver (the async `sqlite3`-backed one). Only
  `"better-sqlite3"` (sync) and `"sqljs"` remain for file/in-memory SQLite. Any config using
  `type: "sqlite"` needs to become `type: "better-sqlite3"`, and the `better-sqlite3` npm
  package must be installed. TypeORM 1.1.0's peer range is `better-sqlite3@^12.0.0` — the
  installed latest major (13.x) is *not* compatible; pin to the latest 12.x.
- `better-sqlite3` takes an exclusive lock per write and has no built-in cross-connection
  queuing the way the old async `sqlite3` driver tolerated. If two separate datastores (e.g.
  `acl` and `sql`) are configured to point at the **same** file and both connect concurrently
  (this framework's `ConnectionManager.connect()` opens all datastores via `Promise.all`), the
  second one can throw `SqliteError: database is locked` during startup schema sync. Enabling
  `enableWAL: true` does **not** reliably fix this in practice (confirmed by reproducing it) —
  giving each datastore its own file is the fix that actually works. Don't colocate SQLite
  datastores in test config unless there's a specific reason to.
- Test mocks for Redis must target the `redis` package (node-redis v4 client, `createClient`),
  not `ioredis` — the app migrated off `ioredis` and `ConnectionManager` now does a literal
  `import("redis")`. A reusable in-memory fake (`FakeRedisServer`/`FakeRedisClient`, covering
  `get/set/setEx/ttl/del/unlink/scanIterator/multi().execAsPipeline[Typed]()/publish/subscribe`)
  already exists in `service-core`'s own test suite at `test/helpers/FakeRedis.ts` (not
  published via the package's `/test` export) — mirror it locally rather than reinventing it;
  `mail-server` has its own copy at `test/helpers/FakeRedis.ts` for this reason. Mock with
  `vi.mock("redis", async () => (await import("./helpers/FakeRedis.js")).createFakeRedisModule())`.
- Don't take TypeScript to a new major automatically. TS 7.0.x breaks `@typescript-eslint`'s
  peer range (only supports up to ~6.x) and Yarn's built-in TS compat patch fails to apply
  against it. Stay on the latest 6.x until the toolchain catches up.
- `eslint-plugin-import@2.32.0` (latest) doesn't declare peer support for ESLint 10 yet — the
  resulting Yarn peer-dependency warning is expected/harmless, not a sign something broke.

- `config.get(key)` in nconf (used throughout via `@Config`) does **not** deep-clone nested
  values on the way out: `Memory.prototype.get` returns the internal store object by direct
  reference, and `Provider.prototype._execute`'s single-source merge path
  (`Memory.prototype.merge` → `target[key] = value` when `target[key]` is not yet an object)
  passes non-colliding nested objects through untouched. Practically: `const x = config.get("a")`
  then `delete x.b.c` mutates the **live, shared** config object for every future
  `config.get("a")` call in the process — there is no defensive-copy safety net anywhere in this
  chain (nconf itself, nor `ObjectFactory.initialize()`'s `obj[member] = this.config?.get(path)`
  in `@rapidrest/core`, which assigns the same reference into injected `@Config` fields). Never
  mutate an object returned from `config.get()` in place; clone first
  (`{ ...config.get("auth"), options: { ...config.get("auth").options } }`).

- **The Helm chart in `helm/` was, until 2026-08-25, an unadapted copy of the `petstore_example`
  reference project's scaffold** — never touched since this repo's initial commit, per git log.
  `helm lint` failed outright (`chart.metadata.name is required`), and every app-specific resource
  name rendered as the literal string `-services` (missing the `{{ include "rrst.fullname" . }}`
  prefix `_helpers.tpl` already defines — only `templates/tests/test-connection.yaml` actually used
  it). If a *new* template file is ever added under `helm/templates/`, name its resources the same
  way the fixed ones now do (`{{ include "rrst.fullname" . }}-<suffix>` / `{{ include "rrst.name"
  . }}` for the `app:` label) — don't copy the un-prefixed pattern that was there before.
- **`helm dependency update` needs `Chart.yaml`'s `name:` field to actually be set** before it (or
  `helm lint`/`helm template`) will do anything at all with a chart — an easy first check when a
  chart mysteriously "does nothing."
- **Reading a Bitnami subchart's auto-generated password back out via `lookup` (the pattern
  `service-config.yaml`/`redis.yaml` use for the mongodb/redis root passwords) doesn't work on a
  brand-new `helm install`** — `lookup` only sees resources that already exist in the cluster, and
  the subchart's own Secret is created in the *same* install operation. The app starts with no
  datastore credentials wired in and crash-loops until a follow-up `helm upgrade` (no values need
  to change) picks up the by-then-existing secret. This is inherent to `lookup`'s documented
  behavior, not fixable by rewriting the template differently — see the CAVEAT comments in both
  files, and `templates/NOTES.txt`, which surfaces it to the operator directly.
- A generic YAML-aware IDE linter will flag most Helm template files in this chart as invalid YAML
  (`{{- ... }}` Go-template syntax, especially multi-line `{{- /* comment */ }}` blocks, reads as
  malformed flow-mapping syntax to a plain YAML parser). This is a false positive, not a real
  error — Helm templates aren't valid YAML until rendered. Trust `helm lint`/`helm template`
  (`helm/` has the `mongodb`/`redis` Bitnami subchart dependencies fetched via `helm dependency
  update` — network access to `charts.bitnami.com` confirmed available this session), not the
  editor's diagnostics, for this directory.

## Session Log

### 2026-09-05 — Phase 1 backend wiring: mount @rapidmx/restapi, DI providers, config, docker-compose

Full implementation plan lives at (session-local) `hello-this-is-a-glowing-milner.md`; this entry captures
what actually landed plus decisions/findings not obvious from the diff alone.

- **Authentication is out of scope for this repo.** A separate `auth-server` (backed by
  `@rapidrest/auth`) is deployed alongside this service and is the sole source of user identity/JWTs.
  `mail-server` only ever **verifies** JWTs — it mounts no sign-in/sign-up/session routes of its own.
  `src/config.{mongo,sql}.ts`'s `auth:` block was trimmed to just what verification needs (`strategy`,
  `secret`, `cookie` for reading `req.user` in SSR, `options.audience`/`issuer`) — all the OAuth/passkey/
  FIDO2/TOTP/session/rbac/oauth_provider issuance-only config was removed, along with the now-unused
  `@simplewebauthn/server`/`argon2`/`jsonwebtoken`/`jwks-rsa`/`otplib` deps from `package.json`.
  `@simplewebauthn/browser`/`qrcode` are still used by the not-yet-removed `apps/` frontend (auth-server
  leftovers slated for Phase 2/3 removal) and were deliberately left in place — removing them now would
  break `apps/` before its own cleanup phase.
- **MAPI over HTTP is explicitly deferred** — not mounted, no MAPI routes added here. (Note: JP's own
  in-progress MAPI work landed in the `mail` repo in parallel with this session's work, per its own commit
  history — unrelated to and untouched by anything in this entry.)
- **Every `@rapidmx/restapi` REST route is now mounted** in both `src/mongo/routes/` and `src/sql/routes/`
  (one-line subclasses, e.g. `MailboxRoute extends MailboxRouteMongo`), at `@ApiRoute("mail/<plural>")` —
  **note the single joined-string form, not an array of segments**: `@ApiRoute(paths)` treats each array
  element as an independent alternate base path (each gets `/api` prepended separately), not path segments
  to join — `@ApiRoute(["mail","mailboxes"])` would mount at both `/api/mail` *and* `/api/mailboxes`, not
  `/api/mail/mailboxes`. Also mounted: the generic `BaseACLRoute` from `@rapidrest/service-core` at
  `/api/acls` (the mechanism for granting/revoking a mailbox's shared/delegate access — see the `mail`
  repo's own 2026-09-05 NOTES.md entry), `MailPushRoute` at `/push`, and `BaseMailIngestRoute` at
  `/internal/mta` (bearer-secret-authenticated MTA hand-off, **not** under `/api` — must never be exposed
  through the public ingress, restrict at the network/deployment level to only the Postfix container).
- **DI provider registration (`objectFactory.register(Class, "Token")`) added to `server.ts`/
  `server.mongo.ts`/`server.sql.ts`** for the five `@rapidmx/restapi` string-token injections
  (`BlobStore`→`LocalFsBlobStore`, `SearchProvider`→`MongoTextSearchProvider`/
  `PostgresFullTextSearchProvider`, `SpamScanProvider`→`RspamdSpamScanProvider`,
  `AvScanProvider`→`ClamAvScanProvider`, `MailTransport`→`PostfixSendmailTransport`) — see the standing
  decision above re: `test/Server.*.test.ts` needing the same registration duplicated, since they build
  their own `Server` rather than importing these scripts.
- **`src/{mongo,sql}/Models.ts`/`Jobs.ts`** (previously `// TODO` stubs) now re-export every
  `@rapidmx/restapi` model/job class so the `ClassLoader` picks them up — confirmed via boot log that Mongo
  collections/indexes for all of them (mailbox, folder, message, quarantine, etc.) get created correctly.
- **`docker-compose.mail.yml`** (new) stands up real Rspamd + ClamAV + Postfix (`boky/postfix`) containers
  and points the `server` service's `mail:scan:*`/`mail:transport:ingest:secret` config at them — per JP's
  explicit direction, real providers in dev, not stubs. **Known incomplete piece, flagged rather than
  guessed at:** `PostfixSendmailTransport` shells out to a local `sendmail` binary for *outbound* mail
  (needs that binary installed/configured in the `server` image to relay through the compose Postfix
  container — not yet done), and *inbound* delivery needs Postfix's own `main.cf`/`master.cf` configured
  with a content-filter/recipient-validation policy calling this service's `/internal/mta/resolve` and
  `/internal/mta/deliver` — also not yet authored. The three containers stand up and are reachable; the
  actual Postfix-side integration is real, non-trivial follow-up work, not a config oversight.
- **Pre-existing test flake, not caused by this work:** `test/Server.mongo.test.ts`/`Server.sql.test.ts`
  fail locally with `ECONNREFUSED ::1:6379`/`127.0.0.1:6379` (a real Redis connection attempt) *despite*
  both files `vi.mock("redis", ...)`-mocking the `redis` package at the top — reproduced both before and
  after every change in this session, and CI's plain `yarn test` job (no docker-compose redis service
  defined in `.github/workflows/ci.yml`'s `test` job) presumably hits the same thing or relies on something
  not yet understood (a `redis-memory-server`-style auto-provisioned local Redis was suspected from the
  `REDISMS_DISABLE_POSTINSTALL` env var in that job, but no such package is actually wired into these two
  test files). Not investigated further this session — everything else (534/540 tests) passes, including
  every other route/model file this session touched. Worth a dedicated look before relying on `yarn test`
  as a clean gate for `Server.*.test.ts` specifically.
- Verification performed: `yarn tsc --noEmit`, `yarn lint`, and `yarn test` all clean except the
  pre-existing Redis flake above; confirmed via boot-log inspection that `/api/mail/*`, `/api/acls`, and
  `/push` all mount with every expected HTTP method once the `yarn patch` fix (see standing decision above)
  replaced the broken `portal:` link.

### 2026-09-05 — Phase 2: admin console (mailboxes/quarantine/ingest-queue), Tailwind wired in

- **Scope discipline lesson learned mid-session, worth repeating:** `apps/www` and `apps/admin` share
  `apps/shared/lib/api.ts`/`components/`. Phase 2 is admin-only — `apps/www`'s auth-server pages
  (sign-in/sign-up/account) are still live and unmodified until Phase 3. Simplifying/gutting a *shared* file
  because the admin rewrite no longer needs most of it broke `apps/www` outright (`account.test.tsx` failed
  with "No hasSecondFactor export" once `api.ts` was trimmed to just `apiFetch`/`ApiRequestError`) — `apps/www`
  still imports two dozen other functions from it. Fixed by restoring `api.ts`/`api.test.ts` to their exact
  original content via `git checkout HEAD --`; the new admin code only ever needed `apiFetch`/`ApiRequestError`,
  both already present in the untouched file. **Rule for the rest of this project: never trim a file under
  `apps/shared/` for one app's sake while another app still imports from it — only ADD to shared files, or
  first confirm (`grep` the other app's tree) that nothing else depends on what's being removed.** `apps/www`
  itself only gets touched in Phase 3.
- Removed: `apps/admin/index.tsx` + `users/**` (old auth-user list/detail/new pages),
  `apps/shared/components/admin/users/**`, `apps/shared/lib/adminApi.ts`, and their `test/apps/admin/**`
  counterparts. Kept the *structural* patterns (paginated list + detail-page-via-query-param, per
  `readTargetUid()`/`.ssr.test.tsx` convention — this framework has no dynamic route segments) but none of
  the auth-user content.
- **`AdminShell` no longer does local step-up elevation** (there's nothing to step up to — see Phase 1's
  "auth is external" decision) — it now just calls the already-mounted, trusted-role-gated
  `GET /api/admin/release-notes` as a plain authorization canary (200 = admin, 401/403 = not), and an
  unauthenticated visitor is redirected to auth-server's own sign-in page via the new
  `apps/shared/lib/session.ts` (`useRedirectIfUnauthenticated`, replacing auth-server's `useSessionRefresh`
  for this app only — `apps/www` keeps the original until Phase 3). `authServerUrl` reaches the client via
  each admin page's server-side `fetchProps` (`src/{mongo,sql}/routes/AdminConsoleRoute.ts` now inject it
  from `mail:auth_server_url` config) — the same mechanism `userUid` already used, just app-level instead of
  framework-automatic.
- New pages, all built directly on Phase 1's REST routes with **no admin-only endpoints** — every one is the
  same route a delegate/owner would call, just returning more when the caller's JWT carries a trusted role
  (see Phase 1's `BaseMailboxRoute` fix): `apps/admin/index.tsx` (mailbox list + search-free pagination,
  mirroring auth-server's old `UserTable` pattern structurally), `mailboxes/new` (creates a true ownerless
  shared mailbox — trusted-only, per Phase 1), `mailboxes/detail` (info + a new `ShareAccessCard` that reads/
  writes a mailbox's ACL via the generic `BaseACLRoute` mounted at `/api/acls` — this *is* the "share this
  mailbox" UI), `quarantine` and `ingest-queue` (both take `?mailboxUid=` from the query string, since
  `BaseScopedChildRoute` has no cross-mailbox listing capability by design — browsing to a mailbox's own
  quarantine/queue is the only shape the API actually supports, so that's what the UI does too).
- `apps/shared/lib/adminApi.ts` → replaced with `apps/shared/lib/mailApi.ts` (typed wrappers for
  Mailbox/Quarantine/IngestQueue/ACL) — used by `apps/admin` now, and left in place for `apps/www` to import
  from too once Phase 3 needs the same data. `vitest.config.ts`'s 100%-coverage glob for `adminApi.ts` was
  repointed at `mailApi.ts`.
- **Tailwind is now actually wired in**, not just installed (Phase 1b only added the build plugin): every
  `apps/shared/components/{buttons,feedback,forms}/*` primitive (`Button`/`Alert`/`FormField`/`Modal`) and
  all of `apps/admin` were restyled to Tailwind utility classes against the `@theme` tokens from
  `apps/shared/styles/app.css`, imported from `AdminShell` (confirmed — per Phase 1b's note — that importing
  it from any component in a hydration entry's module graph is sufficient for `ReactRoute`'s manifest-based
  `<link>` injection to pick it up, no wiring in `_layout.tsx` needed). `apps/www` still renders against the
  old `.rr-*`/`globals.css` system until Phase 3 rewrites it — expect it to look visually broken/inconsistent
  with `apps/admin` in the meantime; that's an accepted transitional state, not a bug to fix now. Kept the
  `oauth` `Button` variant (styled as a `secondary` alias) purely so `apps/www`'s still-live
  `IdentifierStep.tsx` keeps compiling — remove it in Phase 3 once that component is gone.
- **This project holds `apps/admin/**`, `apps/www/**`, `apps/shared/components/admin/**`, and
  `apps/shared/lib/mailApi.ts` to 100% branch/line/function/statement coverage** (see `vitest.config.ts`) —
  every new page/component here needed real tests for every branch, including ones that felt redundant
  (both the `ApiRequestError` and generic-`Error` sides of every `catch`, every `formatBytes` size tier, the
  SSR (`typeof window === "undefined"`) guard on every page reading `?query=` params via a dedicated
  `.ssr.test.tsx` run under `@vitest-environment node` — mirrors auth-server's own established pattern for
  this, e.g. its old `users/detail.ssr.test.tsx`). Two genuinely dead defensive branches were simplified away
  instead of chasing coverage for them: `mailApi.ts`'s `buildQuery()` no longer accepts possibly-`undefined`
  extra params (nothing ever called it that way), and `quarantine/index.tsx`'s `handleRelease()` dropped two
  `if (!x) return`-style guards that were unreachable in practice (the button that calls it only ever renders
  once both preconditions already hold) in favor of two documented non-null assertions.
- Verification: `yarn tsc --noEmit` and `yarn lint` clean; full `yarn vitest run` (all of `test/apps` plus
  `test/Server.*.test.ts`) is 474/480 passing — the 6 failures are the exact same pre-existing Redis flake
  from the Phase 1 entry above, unrelated to this work; no coverage-threshold errors anywhere.

### 2026-09-06 — Phase 3: core webmail client (`apps/www`) — shell, inbox, compose w/ Monaco

- **Removed all remaining auth-server leftovers from `apps/www`**: `account/`, `auth/signin`, `auth/signup`,
  and their exclusive supporting tree (`apps/shared/components/{sign-in,sign-up,account,elevation}`,
  `apps/shared/components/layout/AuthShell.tsx`, `apps/shared/components/forms/{CodeInput,PasswordFieldset}.tsx`,
  `apps/shared/lib/{elevation,useSessionRefresh,identifier,passwordCriteria}.ts`) plus their `test/apps/**`
  counterparts — verified safe via `grep -rl` across the whole `apps/` tree *before* deleting anything (the
  Phase 2 lesson below), confirming zero references outside the doomed tree.
- **`apps/shared/lib/api.ts` was finally trimmed** to just `apiFetch`/`ApiRequestError` (dropping ~40
  auth-issuance functions: sign-in, MFA, OAuth, passkey/FIDO2, secrets, profiles, aliases, accounts,
  elevation) — safe now that the account/auth pages that were its only remaining consumers are gone (`grep`
  across all of `apps/` confirmed every surviving caller — `apps/admin/**` and the new `apps/www/**` — only
  ever used `apiFetch`/`ApiRequestError`). `test/apps/_lib/api.test.ts` rewritten to match; the 5 now-orphaned
  test files for the deleted modules (`elevation`, `identifier`, `passwordCriteria`, `useSessionRefresh`,
  `ElevationHost`, `account`, `auth/signin`, `auth/signup`) removed. `Button`'s `oauth` variant (kept in Phase
  2 only for the still-live `apps/www` auth components) removed too — confirmed dead via `grep`.
- **`apps/www` now has three real pages**, all sharing one new `MailShell` (`apps/shared/components/mail/
  layout/MailShell.tsx`, replacing `AuthShell`): a folder-tree sidebar + mailbox switcher + top bar. Like
  every other query-param reader in this codebase, it reads `?mailboxUid=`/`?folderUid=` only inside a
  `useEffect` (never during the render body itself) so the server-rendered and just-hydrated client markup
  match — reading `window.location.search` directly in the render body would desync SSR (always empty) from
  the client's first hydration pass (real query string), a hydration-mismatch bug, not just a style
  preference. Exposes the resolved `{mailboxUid, folderUid, mailboxes, folders}` to page content via a small
  `useMailShell()` context hook — the one deliberate new abstraction this phase introduced, needed because two
  independent pages (inbox, compose) both need the shell's already-resolved mailbox/folder selection rather
  than re-deriving it. Mailbox visibility/switching and "shared" labeling ride entirely on Phase 1's
  `BaseMailboxRoute` ACL fix (`ownerUserUid` absent ⇒ shown as "(shared)"), exactly as planned.
  - `apps/www/index.tsx` — the inbox: message list (any folder, via `?folderUid=`) + reading pane. Marks a
    message read on selection (best-effort — a failed PUT doesn't block reading), lists attachments for a
    selected message via a second `listAttachments()` call, and renders the message body via `<iframe
    sandbox="" src="/api/mail/messages/:id/content">` rather than `dangerouslySetInnerHTML` — same-origin
    `fetch`/cookie auth just works for the iframe's navigation, and the empty `sandbox` attribute blocks script
    execution as defense-in-depth even though the content is already `ScanPipeline`-sanitized server-side.
  - `apps/www/compose/index.tsx` — to/cc/bcc/subject fields, a Monaco HTML editor, drag-in-a-file attachment
    upload, and Send. Folder tree is real quarantine-list-instead of "Junk" — a Drafts-folder message uid is
    created via `createDraft()` the moment the mailbox/Drafts-folder resolve.
- **Real library gap found and fixed at the source (per this repo's standing rule)**: `@rapidmx/restapi`'s
  `BaseMessageRoute` had `send()` but *no way to fetch a message's body content at all* — the reading pane
  literally could not have worked without this. Added `GET /:id/content` (mirrors `BaseAttachmentRoute.
  download`'s shape exactly): serves `sanitizedHtmlBlobKey` as `text/html` if the message has one, else falls
  back to `bodyPreview` as `text/plain` — deliberately never serves `bodyBlobKey`'s raw MIME (never sanitized).
  Same 404-on-no-permission-or-missing pattern as every other read endpoint in the library. Landed in `mail`
  with full test coverage (mongo+sql integration tests, a `BaseMessageRoute.test.ts` guard-clause unit test) —
  version left alone per the standing "don't bump versions" rule; needs a fresh `yarn patch` here once JP
  publishes, or immediately if further local `mail` testing is needed (see the `yarn patch` workflow above).
- **New mail-server-local glue for compose→MIME**, exactly as the original plan called for (`@rapidmx/restapi`'s
  `send()` deliberately does no MIME composition — see its own doc comment): `src/routes/
  BaseMailComposeRoute.ts` (+ 2-line `mongo`/`sql` concrete subclasses) exposes `POST /api/mail/compose/:id/
  assemble` — takes structured `{to, cc, bcc, subject, html}`, resolves the draft's owning `Mailbox` for a
  trustworthy `From` (never client-supplied — closes the same spoofing class of bug `BaseAttachmentRoute.
  upload` was hardened against previously), pulls in whatever `Attachment`s are already uploaded against the
  draft (via the library's own `BaseAttachmentRoute.upload`, called first from the client), and builds real
  RFC 5322 MIME via `nodemailer`'s `MailComposer` — the *same* serializer `@rapidmx/restapi`'s own MAPI
  `RopSubmitMessageHandler` already uses for an identical purpose (confirmed by reading it first, not
  reinvented). Stores the MIME as a fresh `bodyBlobKey` and updates the draft's `subject`/`recipients`/`from`/
  `bodyPreview` — does not send; the client still calls the library's own `POST /messages/:id/send` after.
  Built as a *new abstract class in this repo* (`src/routes/`, not `mongo/`/`sql/`), not in `@rapidmx/restapi`,
  because it's webmail-presentation glue specific to this compose UI's input shape, not a generic library
  capability — modeled directly on `BaseMailIngestRoute`'s DB-agnostic-base-class-with-repo-injection pattern.
- **Monaco Editor decision, made explicitly with JP mid-session**: no browser/visual-testing tool is available
  in this environment, and Monaco's usual Vite integration needs its bundled workers loaded via `?worker`
  suffix imports (`monaco-editor/esm/vs/editor/editor.worker?worker`) — **that syntax fails to even resolve
  under vitest's transform pipeline** (`Failed to resolve import "...editor.worker?worker"` from
  `TransformPluginContext`), independent of `vi.mock`, since it's Vite-core's worker-bundling feature and this
  project's `createViteConfig()` has no dedicated worker-output plugin/config enabling it in that context.
  Rather than ship an unverifiable, test-breaking custom-worker setup, `MonacoHtmlEditor` (`apps/shared/
  components/mail/compose/MonacoHtmlEditor.tsx`) runs with **no `self.MonacoEnvironment` at all** — Monaco
  falls back to running its tokenizer on the main thread with a one-time console warning, not a functional
  loss for plain HTML source editing (no language-service/diagnostics workers are relevant here anyway). This
  sidesteps the untestable custom-worker path entirely and let the component get full, real vitest coverage
  (mock `monaco-editor` itself via `vi.mock`, drive a fake `IStandaloneCodeEditor`) instead of being one more
  thing JP has to manually smoke-test. **JP should still smoke-test the compose page for real in a browser**
  (`yarn dev`) before relying on it — this whole Monaco integration, workerless fallback included, is
  unverified beyond `vitest`+`tsc`+`lint` passing, per his own explicit call on how to proceed given the
  tooling gap.
- Added `monaco-editor` (`^0.56.0`) and `nodemailer`/`@types/nodemailer` (`^7.0.3`, matching the version
  `@rapidmx/restapi` itself already depends on, to keep one deduped copy rather than two majors) as direct
  `dependencies`/`devDependencies`. Removed `@simplewebauthn/browser`/`qrcode` (dead now that the auth
  components using them are gone).
- `src/{mongo,sql}/routes/wwwRoute.ts` gained the same `fetchProps` → `{authServerUrl}` pattern
  `AdminConsoleRoute.ts` already used, sourced from `mail:auth_server_url` config.
- **This project's 100%-coverage bar (see Phase 2 entry) was held for every new/changed frontend file this
  phase** — `MailShell.tsx`, `apps/www/index.tsx`, `apps/www/compose/index.tsx`, `MonacoHtmlEditor.tsx`,
  `mailApi.ts`'s new functions — including corner cases worth remembering: `MailShell` originally had folder-
  load failures silently swallowed (the `error` state was only ever rendered in the full-page `status ===
  "error"` branch, but a folder-fetch failure leaves `status` at `"ready"` since only the *mailboxes* fetch
  drives `status`) — fixed by giving folder-load errors their own `folderError` state rendered inline in the
  sidebar instead of blocking the whole shell. Two `?? ""` defensive fallbacks in `MailShell` (mailbox-uid
  fallback in the switcher's `value` and in folder `href`s) were provably dead — both only render once
  `mailboxUid` is already guaranteed defined — so the surrounding conditions were restructured to narrow via
  TypeScript control flow (`{mailboxUid && mailboxes.length > 1 && (...)}`, `{!mailboxUid ? ... : (...)}`)
  instead of writing contrived tests for unreachable branches, same philosophy as Phase 2's dead-code
  simplifications.
- **Known, accepted, pre-existing gap — not introduced by this phase, not fixed this session**: this repo's
  own bespoke `src/routes/*` files (`MailIngestRoute` since Phase 1, now also `BaseMailComposeRoute`) and even
  several routes copied from the `auth-server` scaffold before any of this project's work (`MetricsRoute`,
  `StatusRoute`, `OpenAPIRoute`, `PushRoute`, `AdminRoute`, every `mongo/routes/*.ts`/`sql/routes/*.ts` one-
  line subclass) show 0% in an isolated single-file `vitest run <file>` — because nothing outside
  `test/Server.mongo.test.ts`/`test/Server.sql.test.ts` (which import every route via `ClassLoader`'s
  `basePath` scan) ever imports them, and *those* two files are the ones hitting the pre-existing Redis-flake
  crash (see Phase 1 entry) that appears to abort the process before `v8`'s coverage report gets written on a
  full `yarn vitest run`. There is currently no dedicated route-level integration-test suite for this repo's
  own `src/routes/*` classes at all (unlike `@rapidmx/restapi`'s own `test/routes/**`) — `BaseMailComposeRoute`
  only has the cheap guard-clause unit test the mail-library convention uses for the same purpose
  (`test/routes/BaseMailComposeRoute.test.ts`), not real HTTP+DB integration coverage. Fixing the Redis flake
  (so a full run's coverage report actually gets generated and this becomes visible/enforced in CI) is real,
  valuable, pre-existing follow-up work — flagged again here rather than attempted as a Phase 3 side-quest.
- Verification: `yarn tsc --noEmit` and `yarn lint` clean (both repos). `mail-server`'s full `yarn vitest run`:
  175/181 passing, the only 6 failures being the exact same pre-existing Redis flake documented in the Phase 1
  entry (confirmed unchanged by re-running before/after this session's edits). Every new file's *own*
  per-file coverage verified individually at 100% via `vitest run <file>` + inspecting `coverage-final.json`
  branch/statement maps directly (not just trusting the aggregate, which single-file runs can't produce
  correctly against this config's thresholds). `@rapidmx/restapi`'s own full suite re-run after the
  `BaseMessageRoute.content()` addition — still green (see that repo's own NOTES.md for its Phase 3-adjacent
  entry).
- **Remaining Phase 3 plan items not done this session**: the actual send/receive round-trip verification
  through the real docker-compose Postfix/Rspamd/ClamAV stack (needs a running docker environment + manual
  `yarn dev` walkthrough — JP's to do, per the Monaco decision above). Phase 4 (sharing UI, contacts, calendar,
  tasks/notes, search, push, EAS/Autodiscover mounting, visual polish) not started.

### 2026-09-06 — Fixed `yarn dev`'s SSR crash on `*.css` imports (JP-reported); found `yarn build`'s client tsc pass was also never actually run

JP ran `yarn dev` for the first time against this session's Phase 3 work and hit `SSR error for "/":
Unknown file extension ".css"` — a real, previously-undiscovered gap in `@rapidrest/react` itself (its own
documented "import your stylesheet anywhere in a client entry's module graph" pattern, used by `MailShell`/
`AdminShell` since Phase 1b/2, was never actually exercised through real SSR before this). Full root-cause
and fix landed in `@rapidrest/react`'s own NOTES.md/commit — summary here since it directly explains why
`yarn dev`/`yarn build` behave differently now:

- **Two bugs, not one.** (1) `ReactRoute`'s SSR-time `import()` of a page/layout module has no CSS handling
  at all — fixed via a Node module-customization hook (`ssrAssetLoaderHooks.ts`) that no-ops `*.css` imports,
  covering both the dev failure mode (file exists, but Node's loader rejects the extension) and the
  production failure mode (`tsc`'s `dist/` output never gets a `.css` copy at all, so resolution itself
  fails). (2) Even once SSR stopped crashing, **no `<link rel="stylesheet">` tag was ever actually injected**
  — `ReactRoute.resolveClientUrls()` only read a manifest entry's own `css` array, and Vite hoists a
  stylesheet imported by a *shared* component (`MailShell`/`AdminShell`, not the entry page itself) onto
  whichever intermediate chunk actually contains the import, never propagated back onto the entries that
  transitively pull it in. This means **the admin console's Tailwind styling had never actually loaded in a
  real browser since Phase 2** — Phase 2's NOTES.md claim that this was "confirmed" was based on a unit test
  fabricating manifest JSON directly, not a real SSR render of real CSS-importing app code. Both are fixed
  now (see `@rapidrest/react`'s own NOTES.md entry for the full mechanism).
- **`yarn build`'s client TypeScript pass (`tsc -p tsconfig.client.json`) had never actually been run
  against this project's real CSS-importing/File-handling code either** — running it as part of verifying
  the fix above surfaced two more previously-undiscovered issues:
  - `import "*.css"` doesn't typecheck without `vite/client`'s ambient `declare module "*.css"` — added
    `"types": ["vite/client"]` to `@rapidrest/react`'s `tsconfig.client.base.json` (source-level fix, same
    patch as the SSR fix above).
  - `apps/www/compose/index.tsx`'s `handleFilesSelected` — `Array.from(e.target.files)` inferred as
    `unknown[]` (not `File[]`) specifically because `e.target.files` is a property access through React's
    *generic* `ChangeEvent<T>` type; TypeScript's control-flow narrowing doesn't propagate through a chained
    property access into a generic-substituted property the same way it does for a plain/local one (confirmed
    by isolated repro — a non-generic interface with the identical 2-level property-access shape narrowed
    fine). Fixed by extracting to `const fileList: FileList | null = e.target.files;` first, **with an
    explicit type annotation** — assigning without one still produced the same `unknown[]` downstream,
    confirming the issue is specifically about the generic substitution, not the property-chain depth alone.
- **Verification this time went well beyond `tsc`/`lint`/`vitest`**: actually ran `yarn dev` (its CLI
  auto-provisions in-memory Mongo/Postgres/Redis — `mongodb-memory-server`/`postgres-memory-server`/
  `redis-memory-server`, no Docker needed) and `curl`'d `/`, `/admin`, `/compose` directly, confirming real
  `200`s with a real injected `<link rel="stylesheet">` resolving to real Tailwind-compiled CSS (`200
  text/css`). Then did the same against a genuine `yarn build` + `node dist/src/server.mongo.js` production
  run (own small script booting `mongodb-memory-server`/`redis-memory-server` directly and pointing the
  compiled server at them via `datastores__*__url` env vars, since `rapidrest dev`'s auto-provisioning only
  wires up `tsx`-run source, not compiled `dist/`) — same result, confirming the fix holds in both dev and
  production code paths, not just one.
- `@rapidrest/react` re-patched (`yarn patch`/`yarn patch-commit`) three times over the course of this fix as
  each successive real-environment test surfaced the next layer of the bug — see that repo's own NOTES.md
  for why a single naive fix attempt wasn't enough. Left `@rapidrest/react`'s own unrelated in-progress
  `.webp`/`.avif` MIME-type work (JP's, uncommitted, discovered mid-session) untouched — staged and committed
  only this session's own hunks via `git add -p`, verified via `git diff --cached` before each commit.
- Verification: `yarn tsc --noEmit`, `node_modules/.bin/tsc -p tsconfig.client.json --noEmit` (**note: the
  plain `yarn tsc --noEmit` alone does NOT cover `apps/**` — its `tsconfig.json` only includes `"src"`; the
  client tsconfig is a separate config only otherwise invoked by `yarn build`, easy to silently skip when
  only running the backend typecheck**), `yarn lint`, and full `yarn vitest run` all clean (175/181, same
  pre-existing Redis flake as every prior entry) — plus the real `yarn dev`/`yarn build` verification above,
  which is what actually caught both bugs in the first place.

### 2026-09-06 — Dev-only auto-login: skip needing a real auth-server for `yarn dev`

JP asked for code that only runs under `yarn dev`, auto-minting a valid JWT so the webmail/admin UIs are
usable without standing up the separate `auth-server` deployment locally. New: `src/dev/DevAutoAuthStrategy.ts`
(an `AuthStrategy` implementation) + `src/dev/enableDevAutoLogin.ts` (the gating/wiring helper), called from
`server.ts`/`server.mongo.ts`/`server.sql.ts` right before `server.start()`.

- **`src/server.ts` is the real entry point `rapidrest dev`/`yarn build`/`yarn start` all actually use — not
  `server.mongo.ts`/`server.sql.ts`.** `cli/src/commands/dev.ts` hardcodes `tsx --watch src/server.ts`;
  `server.ts` itself just imports `./config.js`, a thin switcher currently pointing at `config.mongo.js`.
  `server.mongo.ts`/`server.sql.ts` are separate, parallel entry points that exist for explicit single-backend
  runs — Phase 1 correctly updated all three for the DI-provider registrations, but I initially only updated
  two of the three for this feature and spent a long debugging detour on "why does my code never run" before
  finding the third file. **Whenever adding something that must apply to `yarn dev`, grep for `server.ts` too
  — don't assume `server.mongo.ts`/`server.sql.ts` are the only entry points.**
- **How the auth override actually works, mechanically**: `AuthMiddleware.strategies` is a plain
  `Map<string, AuthStrategy>`, populated once at `@Init` from whatever `auth:strategy` config names (here,
  `"auth.JWTStrategy"` → the real `JWTStrategy`, registered under its own `.name = "jwt"`). `RouteUtils`'s
  per-route auth middleware always tries strategy name `"jwt"` (every route defaults to
  `authStrategies = ["jwt"]` when no `@Auth` decorator says otherwise — confirmed by reading
  `RouteUtils.ts:268-271`), gated only by whether that ROUTE requires auth (`ReactRoute`'s own `get()` has no
  `@Auth` at all, so it's *never* required — a request with no/invalid cookie just proceeds with
  `req.user` unset, exactly the existing anonymous-browsing behavior). `DevAutoAuthStrategy` also names itself
  `"jwt"` and gets `.register()`-ed onto the *same* `AuthMiddleware` instance, **replacing** the real
  strategy's entry for that name — not adding a second one. It still wraps (not bypasses) real verification:
  an already-valid `jwt` cookie decodes and passes through unchanged; only a missing/invalid one falls through
  to minting a fresh token for a synthetic `dev-user`. Once minted, the cookie is a completely normal, validly
  signed token — every subsequent request (page loads *and* the webmail UI's own `/api/mail/**` calls) just
  authenticates via that cookie exactly like a real auth-server session would, no special-casing needed
  anywhere else.
- **`ObjectFactory.newInstance(SomeClass)` with no explicit name is *not* a singleton call — it always
  creates a brand-new instance** (confirmed by reading `core/src/ObjectFactory.ts:399-420`: the "reuse the
  existing default instance" fallback is an explicit special case gated on `name === "default"`, which only
  `@Inject(SomeClass)` triggers implicitly — a bare `newInstance(Class)` call skips that branch entirely).
  `enableDevAutoLoginIfApplicable()` calling `objectFactory.newInstance(AuthMiddleware)` therefore does *not*,
  in general, hand back the same instance `RouteUtils`'s `@Inject(AuthMiddleware)` field resolves to — except
  that `newInstance()` *also* unconditionally records every freshly-created instance as the class's
  `_firstByClass` fallback the moment nothing else of that class exists yet (`ObjectFactory.ts:473-476`), and
  the special-cased `name === "default"` lookup path falls back to exactly that index when no literal
  `"AuthMiddleware:default"` instance exists. Since this call runs *before* `server.start()` — before
  `RouteUtils` ever gets a chance to trigger `AuthMiddleware`'s first creation itself — my instance becomes
  that fallback, and `@Inject(AuthMiddleware)` later resolves to the exact same object. This is order-
  dependent and would silently stop working if this call ever moved to run *after* something else first
  touches `AuthMiddleware` — confirmed correct via real `yarn dev` HTTP round-trips (see below), not just
  reasoning about the DI internals. A unit test verifying this exact mechanism (asserting a *second*,
  independent `newInstance(AuthMiddleware)` call returns the same instance) does **not** work — it's a bare
  call too, so the "always fresh" rule applies to *it* as well; the real test asserts against a mocked
  `ObjectFactory.newInstance` instead (see `test/dev/enableDevAutoLogin.test.ts`).
- **uWebSockets.js gotcha, the actual bug that cost the most time**: minting the token with `JWTUtils.
  createToken()` (the async version) and calling `res.appendHeader("Set-Cookie", ...)` *after* that `await`
  reproducibly crashed the whole `tsx`-watched process — confirmed by isolating the exact line (removing only
  the `appendHeader` call made the crash disappear, keeping everything else identical) — **despite**
  `UWSResponse.appendHeader()` itself being a pure in-memory `Map` write with zero native uWS interaction
  (confirmed by reading `service-core/src/http/uWS/Adapters.ts:197-208` — headers are only actually written to
  the wire later, inside `.end()`'s `res.cork()` block). The real constraint is evidently about *when* in a
  uWS request's lifecycle its native response handle remains valid across an `await`, not about which wrapper
  method gets called — consistent with uWS's own documented requirement that `res.onAborted()` be registered
  and the response be handled within the same synchronous turn unless the caller manages the cork/pause-resume
  dance itself. Fix: mint via `JWTUtils.createTokenSync()` instead, keeping the *entire* mint-and-set-cookie
  path synchronous (no `await` at all inside it) — `mail:dev_auto_login` never uses password-based payload
  encryption, so `createTokenSync`'s own documented downside (blocking the event loop while deriving that
  encryption key) never applies here. Both the mint path (no cookie yet) and the already-verified path (a
  cookie already exists — `JWTUtils.decodeToken`, still `await`ed, but never followed by touching `res`) are
  now safe, and this was verified by real HTTP round-trips (not just "the code compiles") — see below.
- **Known, pre-existing, unrelated dev-tooling flake surfaced by this session's extensive `yarn dev`
  testing**: `tsx --watch src/server.ts` and the concurrently-spawned `vite build --watch` (both started by
  `rapidrest dev`) periodically produce a `Restarting 'src/server.ts'` (sometimes escalating to `Failed
  running ... waiting for file changes`) with **no code change of any kind** — reproduced repeatedly, at
  unpredictable intervals, entirely independent of this session's changes (confirmed happening identically on
  a build with the dev-auto-login feature fully disabled/reverted). Strong suspicion, not fully confirmed:
  `tsx --watch`'s default file-watch scope is broader than just `src/`, and `vite build --watch` rewriting
  `dist/public/**` (its own output) on every rebuild pass is what `tsx` picks up as a "changed" file, causing
  it to kill and restart the very process `vite` has nothing to do with. A live request that happens to land
  mid-restart sees a bare connection reset, easily mistaken for an application crash (this cost significant
  debugging time before the pattern — `Restarting`/`Failed running` log lines with no accompanying JS stack
  trace, at intervals uncorrelated with request timing — was recognized). Worth a real fix (scoping tsx's
  watch to `src/` only, or excluding `dist/`) as follow-up dev-experience work, but out of scope here.
- **Verification**: unit tests for both new files at 100% branch/line/function/statement coverage
  (`test/dev/DevAutoAuthStrategy.test.ts`, `test/dev/enableDevAutoLogin.test.ts`) — plus real `yarn dev`
  end-to-end HTTP verification (`curl`, isolated ports to avoid the restart-thrashing flake above and to avoid
  colliding with JP's own separately-running `auth-server` dev session on port 3000): a cookie-less request to
  `/`, `/admin`, and `/api/mail/mailboxes` each mint a fresh token and return `200` with the new user visible
  (`userUid` in `/`'s/`/admin`'s SSR props; the mailboxes API call succeeding at all); a follow-up request
  carrying that cookie authenticates via real verification (no re-mint, confirmed by the mint log line firing
  exactly once). `yarn tsc --noEmit`, the client `tsc -p tsconfig.client.json --noEmit`, `yarn lint`, and full
  `yarn vitest run` (192/198 — the same pre-existing Redis flake, unrelated) all clean.
- Two genuinely dead branches were simplified rather than tested around: `authenticate()`/`authenticateSync()`
  both originally checked `payload?.profile` after a successful decode before trusting it — but
  `@rapidrest/core`'s own `JWTUtils.finalizePayload()` unconditionally `JSON.parse`s `payload.profile`, which
  itself throws (already caught by the surrounding `try/catch`) if that were ever absent or malformed; a
  *non-throwing* decode therefore always has a usable profile. Removed the redundant check instead of writing
  a test that could only reach it by mocking `JWTUtils` internals.

### 2026-09-06 — rapidmx split: root-caused and fixed the long-standing `ECONNREFUSED :6379` Redis
flake; fixed the coverage-threshold gate it had been masking

This repo is `@rapidmx/server`, the post-split successor to `mail-server` (the old
`@rapidrest/mail` monolith is now four sibling repos: `@rapidmx/restapi`, `@rapidmx/activesync`,
`@rapidmx/autodiscover`, `@rapidmx/mapi`). Picking up the "finish converting so it builds and
tests" work, two blockers stood between a fresh `yarn install` and a clean `yarn build`/`yarn test`.

- **Root cause of the `ECONNREFUSED ::1:6379`/`127.0.0.1:6379` flake, finally found** — flagged as
  an unsolved pre-existing issue in every session entry above since 2026-09-05, always on
  `test/Server.mongo.test.ts`/`Server.sql.test.ts` despite both mocking `redis` via
  `vi.mock("redis", ...)`. Confirmed first that it's **not** new to the split — it reproduces
  identically on a fresh run of the original `mail-server` repo too (the old NOTES.md entries'
  "534/540"-style pass counts were stale snapshots, not evidence it was ever actually fixed).
  Diagnosed by temporarily instrumenting `@rapidrest/service-core`'s `ConnectionKinds.ts`
  `importRedis()` (`console.error(Object.keys(await import("redis")), new Error().stack)`) to see,
  per call site, whether it resolved the fake module (`['createClient', 'RedisClient']`) or the
  real one (the full node-redis export list) — reverted before finishing, not a real code change.
  Every call site resolved the fake **except** the one reached through
  `PushRoute extends MailPushRoute` (`MailPushRoute` from `@rapidmx/restapi`) → `BasePushRoute.init()`'s
  `await importRedis()`. Root cause: `@rapidmx/restapi` was not in `vitest.config.ts`'s SSR
  `noExternal` list, so Vite/Vitest treats it as external and lets Node's own native ESM loader
  load it (and everything it transitively imports, including `@rapidrest/service-core` and its
  `import("redis")`) — a completely separate module registry from Vite's own SSR graph, invisible
  to `vi.mock`, which only intercepts modules Vite itself resolves. Every *other* redis-backed class
  in the same test (`ConnectionManager`, `BaseAdminRoute`) is reached via a route/class that imports
  `@rapidrest/service-core` directly rather than through `@rapidmx/restapi`, so it stayed inside
  Vite's graph and got mocked correctly — which is exactly why the failure looked so
  inconsistent/mysterious across every prior session that poked at it. **Fix**: add
  `'@rapidmx/restapi'` to the existing `noExternal` array (same file, same rationale as the existing
  `@rapidrest/auth` entry — see its comment). Same class of bug as that one, different symptom (a
  real network call instead of a silent `instanceof` failure). **Any future sibling package
  (`activesync`/`autodiscover`/`mapi`, once wired in) that itself does a dynamic
  `import("redis")`/`import("mongodb")`/etc., or extends a `@rapidrest/service-core` base class that
  does, will need the same `noExternal` entry** — this is a general hazard of externalized packages
  that transitively touch anything `vi.mock`'d in a test, not specific to `restapi` or `redis`.
- **This unblocked `test/Server.*.test.ts` for the first time, which surfaced a second, previously-
  invisible problem**: the Phase 3 entry above predicted this exactly ("Fixing the Redis flake ...
  is real, valuable, pre-existing follow-up work" that would make backend route coverage "visible/
  enforced in CI"). Once those two files ran to completion, `yarn test`'s coverage gate failed —
  `src/mongo/routes/*ConsoleRoute.ts`, `src/*/routes/wwwRoute.ts`, and `src/routes/
  BaseMailComposeRoute.ts` sit at 28–87% (exactly the "known, accepted, pre-existing gap" the Phase 3
  entry already documented and deliberately declined to fix with real tests, since only
  `Server.*.test.ts`'s `ClassLoader`-driven boot exercises these files at all). The **config**
  meant to accept that gap was itself broken, independent of the redis fix: `vitest.config.ts`'s
  `coverage.thresholds` had top-level (`branches: 99, functions: 100, lines: 100, statements: 100`)
  values with a comment claiming backend `src/**` "keeps the relaxed 0% fallback above" — but no
  such fallback existed. **The bug**: Vitest's per-glob coverage thresholds (the `'apps/www/**':
  {...}` -style entries) are checked *in addition to* the top-level ones, not instead of them — the
  top-level numbers gate the *overall combined* coverage across every included file. A `'src/**'`
  override alone (tried first) changed nothing, because the aggregate-wide top-level check still
  failed regardless of any glob-specific override. **Fix**: moved the strict 100% requirement
  entirely into an explicit `'apps/**'` glob (previously only `apps/www/**`/`apps/admin/**`/two
  specific `apps/shared/*` paths were listed — `apps/**` is a superset that also now covers
  `apps/_lib`, `apps/_components`, etc., all already at 100% anyway, so this is non-regressive), and
  dropped the top-level/global numbers to `0` — making it the actual backend fallback the comment
  always claimed it was. No test files changed; this is purely a coverage-gate config fix for a
  pre-existing, already-accepted gap, not new backend test coverage.
- Also fixed along the way, both prerequisites just to get a clean `yarn install`/`yarn build` at
  all on this fresh `rapidmx/server` checkout (neither is a `redis`/coverage issue, both were purely
  this-session, first-time-setup problems):
  - `portal:../activesync`/`portal:../autodiscover`/`portal:../mapi`/`portal:../restapi` (as
    initially declared in `package.json`) failed **resolution**, not linking — Yarn 4.2.2 threw
    `Couldn't allocate enough memory` from its libzip-wasm cache writer specifically for `file:`-
    protocol locators, reproducible even packing a single sibling repo alone is instant/fine, and
    unrelated to actual system memory (66GB, mostly free). Switching `file:` → `portal:` avoided the
    zip-cache step entirely (portal is symlink-based) and resolved cleanly. `restapi` was then
    switched again, from `portal:` to the real published `^0.1.0` (see the standing-decision update
    above) once it became clear `restapi` specifically needed to not be portal-linked anyway.
  - A bare `^5.1.0` range let a fresh install pick up `@rapidrest/core@5.2.0` (vs. the original
    repo's resolved `5.1.0`) — pinned back via `resolutions` while diagnosing the redis flake, in
    case the newer minor was the actual cause (it wasn't — the `noExternal` fix above is what
    mattered; verified by trying `5.2.0` again after the real fix, still green). Left the pin in
    place regardless, since nothing calls for the newer minor specifically and it removes one
    variable from future diagnosis.
- Verification: `yarn install`, `yarn build` (backend `tsc` + client `tsc` + Vite frontend build),
  `yarn lint`, and `yarn test` all clean from a fresh checkout — 245/245 tests, no coverage-threshold
  errors. This is the first time (per every prior NOTES.md entry above) this project's full
  `yarn test` has actually passed end-to-end rather than being reported as "clean except the
  pre-existing Redis flake."

### 2026-09-06 — Fixed: newly created mailbox showed "no mailbox available" in webmail/admin

JP reported that a mailbox created via the admin console couldn't be accessed afterward — the
webmail inbox showed "No mailbox available yet." Root cause was in `@rapidmx/restapi`
(`BaseMailboxRoute.create()` never provisioned any folders for a brand-new mailbox, and this
frontend's `MailShell`/Compose both need an Inbox/Drafts folder to already exist to render
anything) — fixed at the source there per this repo's own standing rule ("these aren't
third-party deps you can't touch"). Full root cause and fix are in `@rapidmx/restapi`'s own
`.claude/NOTES.md` (2026-09-06 entry) — no code in this repo changed.

- **Verified the fix end-to-end from this repo**, since that's where the symptom was reported:
  `yarn patch @rapidmx/restapi` here, replaced the extracted copy's `dist/` with restapi's
  freshly-rebuilt one, `yarn patch-commit` — this is a **temporary local patch for verification
  only**, not a real dependency bump. `package.json`'s `@rapidmx/restapi` entry is now
  `patch:@rapidmx/restapi@npm%3A0.1.0#~/.yarn/patches/@rapidmx-restapi-npm-0.1.0-3ebefc6f72.patch`
  instead of the plain `^0.1.0` registry range from the previous entry above.
  **Follow-up needed once JP publishes a new `@rapidmx/restapi` version with the real fix**: run
  `yarn remove` isn't necessary — just edit `package.json`'s dependency back to a plain `^X.Y.Z`
  registry range (matching whatever he publishes) and delete
  `.yarn/patches/@rapidmx-restapi-npm-0.1.0-3ebefc6f72.patch`, then `yarn install`. Don't leave the
  patch in place indefinitely — it pins to a specific extracted `0.1.0` tarball and won't pick up
  any other changes he publishes to that package in the meantime.
- Confirmed via real `yarn dev` + `curl`: `POST /api/mail/mailboxes` followed immediately by
  `GET /api/mail/folders?mailboxUid=...` now returns both an `inbox` and `drafts` folder (previously
  empty), and `GET /admin/mailboxes/detail?uid=...` / `GET /?mailboxUid=...` both render `200`.
  `yarn build`/`yarn test` both still clean (245/245) with the patch applied.

### 2026-09-06 — Refreshed the same patch for Calendar/Contacts/Tasks folder provisioning

While building the new Calendar/Contacts/Tasks views (this repo, `apps/www` — see below), extended
the eager-folder-provisioning fix above in `@rapidmx/restapi` to also cover those three folder
types (full details in restapi's own NOTES.md). Refreshed via the identical `yarn patch
@rapidmx/restapi` → replace extracted `dist/` → `yarn patch-commit` workflow — same patch file path
(`.yarn/patches/@rapidmx-restapi-npm-0.1.0-3ebefc6f72.patch`, since it's still version `0.1.0`), new
content (`yarn install`'s resolution hash moved `663894` → `00bf07`, confirming the refresh actually
took). The "follow-up once JP publishes" note above still applies unchanged — this just updates what
the temporary patch contains in the meantime.

### 2026-09-06 — Moved off the temporary patch: `@rapidmx/restapi` published as `0.2.0`

JP published `@rapidmx/restapi@0.2.0` (includes both folder-provisioning fixes above, plus his own
unrelated EAS Sync/RemoteWipe/OOF model work from the same release). Followed the exact "once
published" steps from the entry two above: `package.json`'s dependency changed from the `patch:`
range back to a plain `"^0.2.0"`, deleted
`.yarn/patches/@rapidmx-restapi-npm-0.1.0-3ebefc6f72.patch`, `yarn install`. `yarn build`/`yarn test`
both clean after (275/275 — the coverage-gate failure seen immediately after the version bump was
`ContactsShell.tsx` sitting untested mid-implementation, unrelated to the restapi upgrade itself; see
the Contacts/Calendar/Tasks entry below once that work is complete).
- **New, expected peer-dependency warning**: `@rapidmx/activesync` (still `portal:../activesync`,
  unpublished) declares a peer range of `~0.1.0` for `@rapidmx/restapi`, now behind this repo's
  `^0.2.0` — `YN0060` warning only, not an error, and harmless today since nothing in this repo
  actually imports from `@rapidmx/activesync` yet (see the split-repo NOTES.md entry above). Will
  need `activesync`'s own peer range bumped, in that repo, once/if this repo ever actually wires it
  in — not this session's concern.

### 2026-09-07 — Calendar view shipped (final piece of Contacts/Calendar/Tasks); two real bugs found via `yarn dev` smoke test

Completed the Calendar app (`apps/www/calendar/index.tsx`) that the two entries above were building
toward: month/week/day grid views (`MonthView.tsx`/`TimeGridView.tsx`), drag-to-move/drag-to-resize
via `@dnd-kit/core`, a full recurrence editor (`RecurrenceEditor.tsx`, built on `rrule`), and
create/edit/delete with the "this occurrence vs. entire series" split Outlook uses for recurring
events (`calendarMutations.ts`). Together with the Contacts/Tasks work already committed, this
closes out the persistent-icon-rail (`AppShell.tsx`) navigation redesign. 461/461 tests, 100%
`apps/**` coverage, clean `tsc`/lint.

Real `yarn dev` smoke-testing (create a mailbox, create a recurring event via `curl`, load
`/calendar`) surfaced two genuine bugs neither unit tests nor typechecking could have caught —
both fixed, not worked around:

1. **`CalendarEvent.startDate`/`endDate` are persisted as plain strings in Mongo despite being
   typed `Date`** (`@rapidmx/restapi`'s `CalendarEventMongo`), so a Mongo `$lte`/`$gte` comparison
   against them (a real `Date` operand, from `ModelUtils.getQueryParamValueMongo`) matches nothing —
   confirmed by inspecting the stored document directly (`doc.startDate.constructor.name ===
   "String"`) and by querying the running server with `curl` (even a trivially-true
   `endDate=gte(1970-01-01)` returned `[]`). This means `calendarApi.ts`'s original
   `listCalendarEvents(folderUid, rangeStart, rangeEnd)` — which pushed the overlap filter down via
   that exact operator DSL — silently returned zero events for *any* date-bounded query, i.e. every
   real calendar page load. **Not fixed at the source** (that's in `@rapidmx/restapi`, a larger,
   cross-repo, publish-cycle change out of scope for this session) — instead, `listCalendarEvents`
   was simplified to `listCalendarEvents(folderUid)`, fetching the flat list (same `{limit: 500}`,
   no server-side date filter, contract as `listContacts`/`listTasks`) and leaving 100% of range
   filtering to `recurrence.ts`'s `expandAllOccurrences` client-side, which was already correct
   regardless of input width. If a future session touches `CalendarEventMongo`/`CalendarEventSQL` in
   restapi, worth actually fixing the root cause there (coerce `Date`-typed fields on write) and
   restoring server-side range filtering as a real optimization — not urgent while a folder's event
   count stays comfortably under the 500-item page size.
2. **`rrule` broke under SSR only**: `import { RRule } from "rrule"` worked fine in the browser
   bundle (Rollup resolves its real ESM build, `dist/esm/index.js`, which does export `RRule`
   directly) but threw `"does not provide an export named 'RRule'"` when this framework's
   server-render path loaded the same module — that path goes through Node's own loader, which (no
   `"exports"` map in `rrule`'s `package.json`) falls back to the `"main"` CJS build, and Node's
   static named-export detection for that build doesn't pick up `RRule`. Fixed with a namespace
   import + fallback: `import * as RRuleNS from "rrule"` then `RRuleNS.RRule ?? RRuleNS.default.RRule`
   (extracted as `resolveRRuleExport` so the fallback branch is unit-testable without fighting
   vitest's own mock-module semantics, which throw rather than return `undefined` for a property a
   `vi.mock` return value doesn't define). Verified against the real dev server both ways (broke
   with the plain named import, HTTP 500 with `SSR error for "/calendar"`; clean `HTTP 200` after).
   **General lesson for this codebase**: any future dependency that ships CJS-only (or CJS+ESM with
   no `"exports"` map) needs this same namespace-import treatment if it's imported from code that
   runs during SSR (anything reachable from a page's default export) — a plain named import can pass
   `tsc`, lint, and the full vitest suite and still be broken in the one place that matters.
- Also hit, and dead-ended on investigating: Vite's `vite build --watch` intermittently failed with
  `EPERM, Permission denied` on `dist/public/assets` during `yarn dev`. Root cause was multiple
  leftover `rapidrest dev` process trees (this session had started/killed several via background
  `nohup yarn dev` runs across the conversation, and not all were fully reaped) all racing to
  write the same output directory concurrently — not a code bug. Killing every stray
  `node.exe` process whose command line referenced this repo and starting exactly one fresh `yarn
  dev` resolved it immediately. Mentioned here only so a future session doesn't waste time
  suspecting Vite/rolldown itself if the same error resurfaces.
- Scope trim from the original plan, not re-confirmed with JP: dropped the "mini month date-picker
  in the sidebar" in favor of plain Prev/Today/Next buttons in the page's own toolbar — `view`/
  `date` still live as local state (seeded once from `?view=`/`?date=`, navigated thereafter without
  a page reload, per the plan's own architecture decision), just without the extra picker widget.
