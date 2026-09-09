///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { useEffect, useState } from "react";
import { Branding, getBranding } from "./brandingApi.js";

const DEFAULT_LOGO_SRC = "/images/logo.svg";
const STYLESHEET_LINK_ID = "branding-stylesheet";

export interface UseBrandingResult {
    branding: Branding | null;
    /** `branding.logoUrl` once loaded, else the built-in default — always a usable `<img src>`. */
    logoSrc: string;
}

/**
 * Fetches the admin-configured `Branding` singleton once on mount and applies its cosmetic side effects
 * (browser-tab title, injected custom stylesheet `<link>`) directly to `document` — the same "resolve real
 * client state once mounted, no SSR prop threading" convention `useIsMobile`/`MailShell`'s query-param reads
 * already use. `GET /mail/branding` needs no auth and never `404`s (see `BaseBrandingRoute.get()`), so a
 * fetch failure here can only be a real network/server problem — swallowed rather than surfaced, since
 * branding is purely decorative and every other part of the shell already depends on the same API being
 * reachable.
 */
export default function useBranding(): UseBrandingResult {
    const [branding, setBranding] = useState<Branding | null>(null);

    useEffect(() => {
        let cancelled = false;
        getBranding()
            .then((result) => {
                if (!cancelled) {
                    setBranding(result);
                }
            })
            .catch(() => {
                // Decorative only — leave `branding` at null, which every consumer already treats as
                // "use the defaults".
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (branding?.title) {
            document.title = branding.title;
        }
    }, [branding?.title]);

    useEffect(() => {
        if (!branding?.stylesheetUrl) {
            return;
        }
        const link = document.createElement("link");
        link.id = STYLESHEET_LINK_ID;
        link.rel = "stylesheet";
        link.href = branding.stylesheetUrl;
        document.head.appendChild(link);
        return () => {
            link.remove();
        };
    }, [branding?.stylesheetUrl]);

    return { branding, logoSrc: branding?.logoUrl || DEFAULT_LOGO_SRC };
}
