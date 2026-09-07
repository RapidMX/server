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

export type CalendarShellProps = Omit<AppShellProps, "active">;

export interface CalendarShellContextValue {
    /** The mailbox currently selected (`?mailboxUid=`, or the caller's first accessible mailbox). */
    mailboxUid?: string;
    /** The selected mailbox's single `calendar`-type folder. */
    folderUid?: string;
    mailboxes: Mailbox[];
}

const CalendarShellContext = createContext<CalendarShellContextValue>({ mailboxes: [] });

/** Reads the mailbox/folder the Calendar is currently showing, as resolved by the enclosing `CalendarShell`. */
export function useCalendarShell(): CalendarShellContextValue {
    return useContext(CalendarShellContext);
}

type Status = "checking" | "error" | "ready";

/**
 * The Calendar app's shell — structurally identical to `ContactsShell`/`TasksShell` (a mailbox has
 * exactly one well-known `calendar` folder, guaranteed to exist by `BaseMailboxRoute.create()`'s
 * eager provisioning in `@rapidmx/restapi`), just bound to a different folder type. Unlike Contacts/
 * Tasks, the actual view being looked at (month/week/day, and which one) is *not* shell state — it
 * lives in `apps/www/calendar/index.tsx`'s own local state, since navigating between views/dates must
 * be instant (no full page reload) and this framework has no client-side router to make a URL-driven
 * approach for that free.
 */
export default function CalendarShell({
    userUid,
    authServerUrl,
    impersonating,
    impersonationBaseUrl,
    trusted,
    children,
}: PropsWithChildren<CalendarShellProps>) {
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
            .catch((err) => setFolderError(err instanceof ApiRequestError ? err.message : "Could not load this mailbox's calendar folder."));
    }, [mailboxUid]);

    const folderUid: string | undefined = folders.find((f) => f.type === "calendar")?.uid;

    const contextValue = useMemo<CalendarShellContextValue>(
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
                {mailboxes.length > 1 && (
                    <div className="w-56 shrink-0 bg-surface border-r border-border p-3">
                        <label
                            className="block text-xs font-bold uppercase tracking-wide text-text-muted mb-1"
                            htmlFor="calendar-mailbox-switcher"
                        >
                            Mailbox
                        </label>
                        <select
                            id="calendar-mailbox-switcher"
                            className="w-full text-sm border border-border rounded-sm py-1.5 px-2 bg-surface"
                            value={mailboxUid}
                            onChange={(e) => {
                                window.location.href = `/calendar?mailboxUid=${encodeURIComponent(e.target.value)}`;
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
                    <div className="p-3">
                        <Alert>{folderError}</Alert>
                    </div>
                )}
                <CalendarShellContext.Provider value={contextValue}>{children}</CalendarShellContext.Provider>
            </>
        );
    }

    return (
        <AppShell
            active="calendar"
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
