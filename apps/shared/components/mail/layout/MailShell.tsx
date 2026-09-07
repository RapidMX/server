///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { createContext, PropsWithChildren, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { Folder, Mailbox, listFolders, listMailboxes } from "../../../lib/mailApi.js";
import Alert from "../../feedback/Alert.js";
import AppShell, { AppShellProps } from "../../layout/AppShell.js";

export type MailShellProps = Omit<AppShellProps, "active">;

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
 * Mail's own contextual sidebar (mailbox switcher + folder tree) + content area, rendered inside the shared
 * `AppShell` chrome (icon rail, header, impersonation banner — see that component). There is no client-side
 * router in this framework (see `ReactRoute`'s file-convention resolver) — the selected mailbox/folder live
 * in the URL's `?mailboxUid=`/`?folderUid=` query params, read once on mount (never during the initial
 * render itself, matching every other query-param reader in this codebase — e.g. `apps/admin/quarantine`'s
 * `readMailboxUid()` — so the server-rendered and just-hydrated client markup match).
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

    let inner: ReactNode = null;
    if (userUid && status === "error") {
        inner = (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <Alert>{error}</Alert>
                </div>
            </div>
        );
    } else if (userUid && status === "ready") {
        inner = (
            <>
                <aside className="w-64 shrink-0 bg-surface border-r border-border flex flex-col">
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
                <main className="flex-1 min-w-0 overflow-y-auto">
                    <MailShellContext.Provider value={contextValue}>{children}</MailShellContext.Provider>
                </main>
            </>
        );
    }

    return (
        <AppShell
            active="mail"
            userUid={userUid}
            authServerUrl={authServerUrl}
            impersonating={impersonating}
            impersonationBaseUrl={impersonationBaseUrl}
            trusted={trusted}
        >
            {inner}
        </AppShell>
    );
}
