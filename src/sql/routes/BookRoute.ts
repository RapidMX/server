///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ReactRoute } from "@rapidrest/react";
import { RouteDecorators } from "@rapidrest/service-core";

const { Route } = RouteDecorators;

/**
 * The public, entirely unauthenticated booking pages (`apps/book/**`) — a visitor with nothing but a
 * `/book/:slug` link picks a slot and books it, or later manages it via `/book/manage/:token`. No
 * `fetchProps` override: unlike `WwwRoute`/`AdminConsoleRoute`, this app never redirects an unauthenticated
 * visitor anywhere and needs no `authServerUrl`/impersonation wiring at all.
 */
@Route("/book")
export class BookRoute extends ReactRoute {
    protected readonly appDir: string = "apps/book";
    protected readonly hydrate: boolean = true;
}
