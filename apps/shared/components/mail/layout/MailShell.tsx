///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import "../../../styles/app.css";
import React, { createContext, PropsWithChildren, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { useRedirectIfUnauthenticated } from "../../../lib/session.js";
import { Folder, Mailbox, listFolders, listMailboxes, stopImpersonating } from "../../../lib/mailApi.js";
import Alert from "../../feedback/Alert.js";
import UserMenu from "../../layout/UserMenu.js";

export interface MailShellProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** auth-server's base URL, injected via the route's `fetchProps` — see `src/mongo/routes/wwwRoute.ts`. */
    authServerUrl?: string;
    /**
     * `true` when this session is an admin "log in as user" impersonation (a `jwt_impersonator` cookie is
     * present — see `src/mongo/routes/wwwRoute.ts`'s `fetchProps` and `@rapidrest/auth`'s
     * `BaseImpersonationRoute`, which sets/clears this cookie from auth-server). Drives the "you are viewing
     * as this user — stop impersonating" banner below.
     */
    impersonating?: boolean;
    /**
     * Where `mailApi.ts`'s `stopImpersonating()` should call: the real auth-server in production, or `""`
     * under `yarn dev` to call this app's own local dev-only impersonation endpoint instead — see
     * `wwwRoute`'s `fetchProps` and `src/dev/DevImpersonationRoute.ts`.
     */
    impersonationBaseUrl?: string;
    /** `true` when the caller's JWT carries a trusted role — shows an "Admin" item in the user menu below. */
    trusted?: boolean;
}

export interface MailShellContextValue {
    /** The mailbox currently selected (`?mailboxUid=`, or the caller's first accessible mailbox). */
    mailboxUid?: string;
    /** The folder currently selected (`?folderUid=`, or the selected mailbox's Inbox). */
    folderUid?: string;
    mailboxes: Mailbox[];
    folders: Folder[];
}

const MailShellContext = createContext<MailShellContextValue>({ mailboxes: [], folders: [] });

/** Reads the mailbox/folder a page is currently showing, as resolved by the enclosing `MailShell`. */
export function useMailShell(): MailShellContextValue {
    return useContext(MailShellContext);
}

const FOLDER_LABELS: Record<string, string> = {
    inbox: "Inbox",
    sent_items: "Sent Items",
    drafts: "Drafts",
    outbox: "Outbox",
    junk: "Junk Email",
    deleted_items: "Deleted Items",
};

/** Well-known folders sort first, in Gmail/Outlook's conventional order; anything else (incl. `user`) sorts after, alphabetically. */
const FOLDER_ORDER = ["inbox", "drafts", "outbox", "sent_items", "junk", "deleted_items"];

function folderSortKey(folder: Folder): number {
    const idx = FOLDER_ORDER.indexOf(folder.type);
    return idx === -1 ? FOLDER_ORDER.length : idx;
}

type Status = "checking" | "error" | "ready";

/**
 * The webmail client's shell: mailbox switcher + folder tree sidebar, replacing `AuthShell` for `apps/www`.
 * There is no client-side router in this framework (see `ReactRoute`'s file-convention resolver) — the
 * selected mailbox/folder live in the URL's `?mailboxUid=`/`?folderUid=` query params, read once on mount
 * (never during the initial render itself, matching every other query-param reader in this codebase — e.g.
 * `apps/admin/quarantine`'s `readMailboxUid()` — so the server-rendered and just-hydrated client markup match).
 */
export default function MailShell({
    userUid,
    authServerUrl,
    impersonating,
    impersonationBaseUrl,
    trusted,
    children,
}: PropsWithChildren<MailShellProps>) {
    const [status, setStatus] = useState<Status>("checking");
    const [error, setError] = useState<string | null>(null);
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [folderError, setFolderError] = useState<string | null>(null);
    const [requestedMailboxUid, setRequestedMailboxUid] = useState<string | null>(null);
    const [requestedFolderUid, setRequestedFolderUid] = useState<string | null>(null);
    const [stoppingImpersonation, setStoppingImpersonation] = useState(false);

    useRedirectIfUnauthenticated(userUid, authServerUrl);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setRequestedMailboxUid(params.get("mailboxUid"));
        setRequestedFolderUid(params.get("folderUid"));
    }, []);

    useEffect(() => {
        if (!userUid) {
            return;
        }
        listMailboxes({ limit: 100 })
            .then((result) => {
                setMailboxes(result);
                setStatus("ready");
            })
            .catch((err) => {
                setError(err instanceof ApiRequestError ? err.message : "Could not load your mailboxes.");
                setStatus("error");
            });
    }, [userUid]);

    const mailboxUid: string | undefined =
        (requestedMailboxUid && mailboxes.some((mb) => mb.uid === requestedMailboxUid) ? requestedMailboxUid : undefined) ??
        mailboxes[0]?.uid;

    useEffect(() => {
        if (!mailboxUid) {
            setFolders([]);
            return;
        }
        setFolderError(null);
        listFolders(mailboxUid)
            .then(setFolders)
            .catch((err) => setFolderError(err instanceof ApiRequestError ? err.message : "Could not load folders."));
    }, [mailboxUid]);

    const folderUid: string | undefined =
        (requestedFolderUid && folders.some((f) => f.uid === requestedFolderUid) ? requestedFolderUid : undefined) ??
        folders.find((f) => f.type === "inbox")?.uid;

    const contextValue = useMemo<MailShellContextValue>(
        () => ({ mailboxUid, folderUid, mailboxes, folders }),
        [mailboxUid, folderUid, mailboxes, folders],
    );

    const sortedFolders = useMemo(
        () => [...folders].sort((a, b) => folderSortKey(a) - folderSortKey(b) || a.name.localeCompare(b.name)),
        [folders],
    );

    function handleSignOut() {
        window.location.href = authServerUrl ?? "/";
    }

    async function handleStopImpersonating() {
        setStoppingImpersonation(true);
        try {
            await stopImpersonating(impersonationBaseUrl ?? "");
        } catch {
            // Navigate either way: a failed call leaves the impersonator cookie (and this banner) exactly as
            // they were, so there's nothing else useful to show — matching this page's other network-error
            // handling, which surfaces via a full reload rather than an inline retry affordance.
        } finally {
            window.location.href = "/admin";
        }
    }

    let content: ReactNode;
    if (!userUid || status === "checking") {
        content = <div className="min-h-screen" />;
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
            <div className="min-h-screen flex flex-col bg-surface-alt">
                {impersonating && (
                    <div className="h-10 shrink-0 bg-warning text-warning-contrast flex items-center justify-center gap-3 text-sm font-medium px-4">
                        <span>
                            You are viewing this mailbox as <strong>{userUid}</strong>.
                        </span>
                        <button
                            type="button"
                            onClick={handleStopImpersonating}
                            disabled={stoppingImpersonation}
                            className="underline hover:no-underline disabled:opacity-60"
                        >
                            {stoppingImpersonation ? "Returning to admin…" : "Return to admin"}
                        </button>
                    </div>
                )}
                <div className="flex-1 flex min-h-0">
                    <aside className="w-64 shrink-0 bg-surface border-r border-border flex flex-col">
                        <div className="h-16 flex items-center gap-2 px-5 border-b border-border font-bold text-lg tracking-tight">
                            <img src="/images/logo.svg" width="24" height="24" alt="" />
                            Mail
                        </div>
                        <div className="p-3">
                            <a
                                href={mailboxUid ? `/compose?mailboxUid=${encodeURIComponent(mailboxUid)}` : "/compose"}
                                className="block text-center w-full py-2.5 px-4 rounded-sm font-semibold text-sm bg-primary text-white hover:bg-primary-dark"
                            >
                                Compose
                            </a>
                        </div>
                        {mailboxUid && mailboxes.length > 1 && (
                            <div className="px-3 pb-2">
                                <label
                                    className="block text-xs font-bold uppercase tracking-wide text-text-muted mb-1"
                                    htmlFor="mailbox-switcher"
                                >
                                    Mailbox
                                </label>
                                <select
                                    id="mailbox-switcher"
                                    className="w-full text-sm border border-border rounded-sm py-1.5 px-2 bg-surface"
                                    value={mailboxUid}
                                    onChange={(e) => {
                                        window.location.href = `/?mailboxUid=${encodeURIComponent(e.target.value)}`;
                                    }}
                                >
                                    {mailboxes.map((mb) => (
                                        <option key={mb.uid} value={mb.uid}>
                                            {mb.displayName}
                                            {mb.ownerUserUid ? "" : " (shared)"}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {folderError && (
                            <div className="px-3 pb-2">
                                <Alert>{folderError}</Alert>
                            </div>
                        )}
                        {!mailboxUid ? (
                            <p className="px-4 py-3 text-sm text-text-muted">No mailboxes available.</p>
                        ) : (
                            <nav className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-0.5">
                                {sortedFolders.map((folder) => (
                                    <a
                                        key={folder.uid}
                                        href={`/?mailboxUid=${encodeURIComponent(mailboxUid)}&folderUid=${encodeURIComponent(folder.uid)}`}
                                        className={[
                                            "flex items-center justify-between text-sm rounded-sm py-1.5 px-2.5",
                                            folder.uid === folderUid
                                                ? "bg-primary/10 text-primary-dark font-semibold"
                                                : "text-text hover:bg-surface-alt",
                                        ].join(" ")}
                                    >
                                        <span>{FOLDER_LABELS[folder.type] ?? folder.name}</span>
                                        {folder.unreadCount > 0 && (
                                            <span className="text-xs font-bold rounded-pill py-0.5 px-1.5 bg-surface-alt text-text-muted">
                                                {folder.unreadCount}
                                            </span>
                                        )}
                                    </a>
                                ))}
                            </nav>
                        )}
                    </aside>
                    <div className="flex-1 flex flex-col min-w-0">
                        <header className="h-16 shrink-0 bg-surface border-b border-border flex items-center justify-end gap-4 px-6">
                            <UserMenu
                                userUid={userUid}
                                authServerUrl={authServerUrl}
                                onSignOut={handleSignOut}
                                showAdminLink={trusted}
                            />
                        </header>
                        <main className="flex-1 min-w-0 overflow-y-auto">
                            <MailShellContext.Provider value={contextValue}>{children}</MailShellContext.Provider>
                        </main>
                    </div>
                </div>
            </div>
        );
    }

    return content;
}
