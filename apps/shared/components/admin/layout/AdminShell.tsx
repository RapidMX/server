///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import "../../../styles/app.css";
import React, { PropsWithChildren, ReactNode, useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "../../../lib/api.js";
import { useRedirectIfUnauthenticated } from "../../../lib/session.js";
import Alert from "../../feedback/Alert.js";
import UserMenu from "../../layout/UserMenu.js";

export interface AdminShellProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** auth-server's base URL, injected via the route's `fetchProps` — see `src/mongo/routes/AdminConsoleRoute.ts`. */
    authServerUrl?: string;
    /**
     * Where `mailApi.ts`'s `impersonateUser()`/`stopImpersonating()` should call: the real auth-server in
     * production, or `""` under `yarn dev` to call this app's own local dev-only impersonation endpoint
     * instead — see `AdminConsoleRoute`'s `fetchProps` and `src/dev/DevImpersonationRoute.ts`.
     */
    impersonationBaseUrl?: string;
}

type Status = "checking" | "denied" | "error" | "authorized";

const NAV_LINKS = [
    { href: "/admin", label: "Mailboxes" },
    { href: "/admin/quarantine", label: "Quarantine" },
    { href: "/admin/ingest-queue", label: "Ingest Queue" },
];

/**
 * Gates every `apps/admin` page behind the `admin` trusted role. Uses `GET /api/admin/release-notes` (any
 * `BaseAdminRoute` endpoint works — this one is side-effect-free) purely as a canary: a 200 means the
 * caller's JWT carries a trusted role, a 403 means it doesn't. There is no local step-up/elevation flow
 * (that would need a cross-origin call to auth-server's own elevation endpoint — not wired up yet).
 */
export default function AdminShell({ userUid, authServerUrl, children }: PropsWithChildren<AdminShellProps>) {
    const [status, setStatus] = useState<Status>("checking");
    const [error, setError] = useState<string | null>(null);

    useRedirectIfUnauthenticated(userUid, authServerUrl);

    useEffect(() => {
        if (!userUid) {
            return;
        }
        apiFetch("/admin/release-notes")
            .then(() => setStatus("authorized"))
            .catch((err) => {
                if (err instanceof ApiRequestError && (err.status === 403 || err.status === 401)) {
                    setStatus("denied");
                    return;
                }
                setError(err instanceof ApiRequestError ? err.message : "Could not verify administrator access.");
                setStatus("error");
            });
    }, [userUid]);

    function handleSignOut() {
        window.location.href = authServerUrl ?? "/";
    }

    let content: ReactNode;
    if (!userUid || status === "checking") {
        content = <div className="min-h-screen" />;
    } else if (status === "denied") {
        content = (
            <div className="min-h-screen flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <Alert>You do not have administrator access.</Alert>
                </div>
            </div>
        );
    } else if (status === "error") {
        content = (
            <div className="min-h-screen flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <Alert>{error}</Alert>
                </div>
            </div>
        );
    } else {
        content = (
            <div className="min-h-screen bg-surface-alt">
                <header className="bg-surface border-b border-border">
                    <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <a href="/admin" className="flex items-center gap-2 font-display font-bold text-lg uppercase tracking-wide">
                                <img src="/images/logo.svg" width="24" height="24" alt="" />
                                Mail Admin
                            </a>
                            <nav className="flex items-center gap-5 text-sm font-medium text-text-muted">
                                {NAV_LINKS.map((link) => (
                                    <a key={link.href} href={link.href} className="hover:text-text">
                                        {link.label}
                                    </a>
                                ))}
                            </nav>
                        </div>
                        <UserMenu userUid={userUid} authServerUrl={authServerUrl} onSignOut={handleSignOut} />
                    </div>
                </header>
                <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
            </div>
        );
    }

    return content;
}
