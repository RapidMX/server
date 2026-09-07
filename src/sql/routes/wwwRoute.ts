///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators, UserUtils } from "@rapidrest/core";
import { ReactRoute } from "@rapidrest/react";
import { RouteDecorators, type HttpRequest } from "@rapidrest/service-core";
import { isRunningUnderYarnDev } from "../../dev/enableDevAutoLogin.js";

const { Route } = RouteDecorators;
const { Config } = ObjectDecorators;

@Route("/")
export class AppRoute extends ReactRoute {
    protected readonly appDir: string = "apps/www";
    protected readonly hydrate: boolean = true;

    @Config("mail:auth_server_url")
    private authServerUrl?: string;

    @Config("trusted_roles", ["admin"])
    private trustedRoles: string[] = ["admin"];

    protected async fetchProps(req: HttpRequest): Promise<any> {
        // Presence alone is enough — the cookie's own validity is what actually governs the active session;
        // this only drives whether the client shows a "stop impersonating" affordance (see MailShell.tsx).
        // Empty string under `yarn dev` tells the client to call this app's own local dev-only impersonation
        // endpoint (see `DevImpersonationRoute`) instead of a real auth-server that isn't running locally.
        const impersonationBaseUrl = isRunningUnderYarnDev() ? "" : (this.authServerUrl ?? "");
        return {
            authServerUrl: this.authServerUrl,
            impersonationBaseUrl,
            impersonating: !!req.cookies?.["jwt_impersonator"],
            // Drives the user menu's "Admin" item (see UserMenu.tsx) — a trusted-role caller can always reach
            // the admin console, this just saves them from navigating there manually to discover that.
            trusted: UserUtils.hasRoles(req.user, this.trustedRoles),
        };
    }
}
