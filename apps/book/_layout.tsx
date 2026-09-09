///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";

export default function Layout({ children }: PropsWithChildren) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>RapidMX: Book</title>
                <link rel="icon" type="image/svg+xml" href="/images/logo.svg" />
                <link rel="alternate icon" href="/favicon.ico" />
            </head>
            <body>{children}</body>
        </html>
    );
}
