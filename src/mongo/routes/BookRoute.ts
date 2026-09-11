///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ReactRoute } from "@rapidrest/react";
import { ObjectFactory, RouteDecorators, type HttpRequest } from "@rapidrest/service-core";
import { fetchBrandingPropsForSSR } from "@rapidmx/restapi";
import { BrandingMongo } from "@rapidmx/restapi/mongo";

const { Route } = RouteDecorators;
const { Inject } = ObjectDecorators;

/**
 * The public, entirely unauthenticated booking pages (`apps/book/**`) — a visitor with nothing but a
 * `/book/:slug` link picks a slot and books it, or later manages it via `/book/manage/:token`. Unlike
 * `WwwRoute`/`AdminConsoleRoute` this needs no `authServerUrl`/impersonation wiring, but it's the most
 * likely of the three apps to be an anonymous visitor's very first (and possibly only) page, so it still
 * gets the same branding `fetchProps()` override for a correctly server-rendered title/favicon/stylesheet.
 */
@Route("/book")
export class BookRoute extends ReactRoute {
    protected readonly appDir: string = "apps/book";
    protected readonly hydrate: boolean = true;

    @Inject(ObjectFactory)
    private brandingObjectFactory!: ObjectFactory;

    protected async fetchProps(_req: HttpRequest): Promise<any> {
        return await fetchBrandingPropsForSSR(this.brandingObjectFactory, BrandingMongo);
    }
}
