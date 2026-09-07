///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ReactRoute } from "@rapidrest/react";
import { RouteDecorators, type HttpRequest } from "@rapidrest/service-core";
import { isRunningUnderYarnDev } from "../../dev/enableDevAutoLogin.js";

const { Route } = RouteDecorators;
const { Config } = ObjectDecorators;

@Route("/admin")
export class AdminConsoleRoute extends ReactRoute {
    protected readonly appDir: string = "apps/admin";
    protected readonly hydrate: boolean = true;

    @Config("mail:auth_server_url")
    private authServerUrl?: string;

    protected async fetchProps(_req: HttpRequest): Promise<any> {
        // Empty string under `yarn dev` tells the client to call this app's own local dev-only impersonation
        // endpoint (see `DevImpersonationRoute`) instead of a real auth-server that isn't running locally.
        const impersonationBaseUrl = isRunningUnderYarnDev() ? "" : (this.authServerUrl ?? "");
        return { authServerUrl: this.authServerUrl, impersonationBaseUrl };
    }
}
