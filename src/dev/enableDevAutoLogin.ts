///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { AuthMiddleware, RouteUtils, type ObjectFactory, type Server } from "@rapidrest/service-core";
import { DevAutoAuthStrategy } from "./DevAutoAuthStrategy.js";
import { DevImpersonationRoute } from "./DevImpersonationRoute.js";

/**
 * `true` only when this process is `tsx --watch src/server*.ts` — i.e. `yarn dev`/`rapidrest dev` — never a
 * compiled `dist/**\/*.js` run (production) and never a test runner. Mirrors `@rapidrest/react`'s own
 * `hasTsxContext` detection in `ReactRoute.resolveAppFile()` (same signal, same reasoning, already proven to
 * correctly distinguish tsx-run source from compiled output in this exact project): a `.ts`-suffixed entry
 * point is only ever tsx running real source, and the `NODE_ENV`/`VITEST`/`JEST_WORKER_ID` checks rule out
 * the ambiguous cases a bare extension check alone can't (a misconfigured `NODE_ENV` on a real deployment
 * that somehow still ran from `.ts`, or a test runner that happens to import this module).
 */
export function isRunningUnderYarnDev(): boolean {
    return (
        process.env.NODE_ENV !== "production" &&
        !process.env.VITEST &&
        !process.env.JEST_WORKER_ID &&
        (process.argv[1]?.endsWith(".ts") ?? false)
    );
}

/**
 * DEV-ONLY: makes every request auto-authenticate as a synthetic local user (see
 * `DevAutoAuthStrategy`'s own doc comment), so the webmail/admin UIs work end-to-end against
 * `yarn dev` without a real `auth-server` deployment running alongside this service. Call this
 * once, immediately before `server.start()` — only from `server.ts`/`server.mongo.ts`/
 * `server.sql.ts`, never from a test file building its own `Server` (those must keep exercising
 * real, unmodified auth).
 *
 * Overrides whatever is registered under the `"jwt"` strategy name (normally the real
 * `JWTStrategy`, per `auth:strategy` config) — safe because `DevAutoAuthStrategy` itself still
 * honors a real, already-valid `jwt` cookie unchanged, only minting a synthetic one when none is
 * present or it fails to verify. A no-op whenever `isRunningUnderYarnDev()` is `false`.
 */
export async function enableDevAutoLoginIfApplicable(objectFactory: ObjectFactory, logger: any): Promise<void> {
    if (!isRunningUnderYarnDev()) {
        return;
    }

    logger.warn(
        "[dev] Auto-login is active — every request will be auto-authenticated as a synthetic local user. " +
            "This ONLY happens under `yarn dev` and is never a substitute for the real auth-server anywhere else.",
    );

    const authMiddleware = await objectFactory.newInstance<AuthMiddleware>(AuthMiddleware);
    const devStrategy = await objectFactory.newInstance<DevAutoAuthStrategy>(DevAutoAuthStrategy);
    authMiddleware.register("jwt", devStrategy);
}

/**
 * DEV-ONLY: mounts a local `/api/admin/impersonate` + `/api/admin/impersonate/stop` pair (see
 * `DevImpersonationRoute`'s own doc comment) so the admin console's "Access this mailbox" button and the
 * webmail client's "stop impersonating" banner both work against `yarn dev` without a real auth-server
 * running — production always calls the real auth-server for this instead (see
 * `apps/shared/lib/mailApi.ts`).
 *
 * Unlike `enableDevAutoLoginIfApplicable()` (which registers an auth *strategy* before `server.start()`),
 * mounting a *route* needs a real `Server` instance to attach to — call this once, immediately after
 * `await server.start()`. `DevImpersonationRoute` is never imported/instantiated at all when
 * `isRunningUnderYarnDev()` is `false`, so — unlike a route that's merely gated at request time — it is
 * never even registered outside of `yarn dev`, matching every other dev-only exception in this codebase.
 */
export async function mountDevImpersonationRouteIfApplicable(
    server: Server,
    objectFactory: ObjectFactory,
    logger: any,
): Promise<void> {
    if (!isRunningUnderYarnDev()) {
        return;
    }

    const routeUtils = await objectFactory.newInstance<RouteUtils>(RouteUtils);
    const route = await objectFactory.newInstance<DevImpersonationRoute>(DevImpersonationRoute);
    await routeUtils.registerRoute(server.getApplication(), route);

    logger.warn(
        "[dev] Mounted a local dev-only impersonation endpoint (POST/GET /api/admin/impersonate[/stop]) so " +
            "'Access this mailbox' works without a real auth-server running. yarn dev only.",
    );
}
