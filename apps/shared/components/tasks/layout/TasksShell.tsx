///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { createContext, PropsWithChildren, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { Folder, Mailbox, listFolders, listMailboxes } from "../../../lib/mailApi.js";
import Alert from "../../feedback/Alert.js";
import AppShell, { AppShellProps } from "../../layout/AppShell.js";
import MailboxProvisioning from "../../layout/MailboxProvisioning.js";

export type TasksShellProps = Omit<AppShellProps, "active">;

export interface TasksShellContextValue {
    /** The mailbox currently selected (`?mailboxUid=`, or the caller's first accessible mailbox). */
    mailboxUid?: string;
    /** The selected mailbox's single `tasks`-type folder. */
    folderUid?: string;
    mailboxes: Mailbox[];
}

const TasksShellContext = createContext<TasksShellContextValue>({ mailboxes: [] });

/** Reads the mailbox/folder Tasks is currently showing, as resolved by the enclosing `TasksShell`. */
export function useTasksShell(): TasksShellContextValue {
    return useContext(TasksShellContext);
}

type Status = "checking" | "error" | "ready";

/**
 * The Tasks app's shell — structurally identical to `ContactsShell` (a mailbox has exactly one
 * well-known `tasks` folder, guaranteed to exist by `BaseMailboxRoute.create()`'s eager provisioning
 * in `@rapidmx/restapi`), just bound to a different folder type. Kept as its own small component
 * (rather than a single generic "SingleFolderShell" parameterized by type) so each app's sidebar can
 * grow its own app-specific controls later without threading extra props through a shared one.
 */
export default function TasksShell({
    userUid,
    authServerUrl,
    impersonating,
    impersonationBaseUrl,
    trusted,
    children,
}: PropsWithChildren<TasksShellProps>) {
    const [status, setStatus] = useState<Status>("checking");
    const [error, setError] = useState<string | null>(null);
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [folderError, setFolderError] = useState<string | null>(null);
    const [requestedMailboxUid, setRequestedMailboxUid] = useState<string | null>(null);

    useEffect(() => {
        setRequestedMailboxUid(new URLSearchParams(window.location.search).get("mailboxUid"));
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
            .catch((err) => setFolderError(err instanceof ApiRequestError ? err.message : "Could not load this mailbox's tasks folder."));
    }, [mailboxUid]);

    const folderUid: string | undefined = folders.find((f) => f.type === "tasks")?.uid;

    const contextValue = useMemo<TasksShellContextValue>(
        () => ({ mailboxUid, folderUid, mailboxes }),
        [mailboxUid, folderUid, mailboxes],
    );

    // A full-screen takeover, not nested inside the rest of the app's chrome — there's nothing else
    // for a mailbox-less caller to do here yet, so the icon rail/header don't render at all.
    if (userUid && status === "ready" && !mailboxUid) {
        return <MailboxProvisioning />;
    }

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
                <aside className="w-56 shrink-0 bg-surface border-r border-border flex flex-col p-3 gap-3">
                    {mailboxes.length > 1 && (
                        <div>
                            <label
                                className="block text-xs font-bold uppercase tracking-wide text-text-muted mb-1"
                                htmlFor="tasks-mailbox-switcher"
                            >
                                Mailbox
                            </label>
                            <select
                                id="tasks-mailbox-switcher"
                                className="w-full text-sm border border-border rounded-sm py-1.5 px-2 bg-surface"
                                value={mailboxUid}
                                onChange={(e) => {
                                    window.location.href = `/tasks?mailboxUid=${encodeURIComponent(e.target.value)}`;
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
                    {folderError && <Alert>{folderError}</Alert>}
                </aside>
                <TasksShellContext.Provider value={contextValue}>{children}</TasksShellContext.Provider>
            </>
        );
    }

    return (
        <AppShell
            active="tasks"
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
