///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";
import { Branding } from "../shared/lib/brandingApi.js";
import { CUSTOM_STYLESHEET_LINK_ID } from "../shared/lib/useBranding.js";

export interface LayoutProps {
    /** See `apps/www/_layout.tsx`'s `LayoutProps` doc comment - identical mechanism, supplied by
     * `BookRoute`'s `fetchProps()` override. */
    branding?: Branding;
}

export default function Layout({ children, branding }: PropsWithChildren<LayoutProps>) {
    const title = branding?.title || branding?.companyName ? `${branding?.title || branding?.companyName}: Book` : "RapidMX: Book";
    const iconHref = branding?.iconUrl || branding?.logoUrl || "/images/logo.svg";
    const stylesheetHref = branding?.stylesheetUrl;

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{title}</title>
                <link rel="icon" type="image/svg+xml" href={iconHref} />
                <link rel="alternate icon" href="/favicon.ico" />
                {stylesheetHref && <link rel="stylesheet" href={stylesheetHref} id={CUSTOM_STYLESHEET_LINK_ID} />}
            </head>
            <body>{children}</body>
        </html>
    );
}
