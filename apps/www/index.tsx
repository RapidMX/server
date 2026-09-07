///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../shared/lib/api.js";
import {
    Attachment,
    Message,
    attachmentContentUrl,
    listAttachments,
    listMessages,
    setMessageRead,
} from "../shared/lib/mailApi.js";
import MailShell, { MailShellProps, useMailShell } from "../shared/components/mail/layout/MailShell.js";
import Alert from "../shared/components/feedback/Alert.js";

export default function InboxPage(props: MailShellProps) {
    return (
        <MailShell {...props}>
            <InboxContent />
        </MailShell>
    );
}

function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
}

function InboxContent() {
    const { folderUid } = useMailShell();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUid, setSelectedUid] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    useEffect(() => {
        setSelectedUid(null);
        if (!folderUid) {
            setMessages([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        listMessages(folderUid, { limit: 50 })
            .then(setMessages)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load messages."))
            .finally(() => setLoading(false));
    }, [folderUid]);

    const selected = messages.find((m) => m.uid === selectedUid) ?? null;

    useEffect(() => {
        if (!selected || !selected.hasAttachments) {
            setAttachments([]);
            return;
        }
        listAttachments(selected.folderUid, selected.uid)
            .then(setAttachments)
            .catch(() => setAttachments([]));
    }, [selected]);

    async function handleSelect(message: Message) {
        setSelectedUid(message.uid);
        if (message.flags.read) {
            return;
        }
        try {
            const updated = await setMessageRead(message, true);
            setMessages((prev) => prev.map((m) => (m.uid === updated.uid ? updated : m)));
        } catch {
            // Best-effort — a failed read-state update shouldn't block viewing the message.
        }
    }

    if (!folderUid) {
        // `MailShell` never renders this component at all until a mailbox is resolved (see its own
        // full-screen `MailboxProvisioning` takeover otherwise) — this is purely the brief gap before
        // that mailbox's own folder list has finished loading, not a "no mailbox" state. Distinct text
        // from the message list's own "Loading…" below — otherwise the two transient states become
        // indistinguishable to anything (a test, a user re-reading the screen) that catches this one.
        return <p className="p-8 text-sm text-text-muted">Loading your mailbox&hellip;</p>;
    }

    return (
        <div className="flex h-full min-h-0">
            <div className="w-96 shrink-0 border-r border-border overflow-y-auto">
                {error && (
                    <div className="p-4">
                        <Alert>{error}</Alert>
                    </div>
                )}
                {loading ? (
                    <p className="p-4 text-sm text-text-muted">Loading&hellip;</p>
                ) : messages.length === 0 ? (
                    <p className="p-4 text-sm text-text-muted">No messages in this folder.</p>
                ) : (
                    <ul>
                        {messages.map((message) => (
                            <li key={message.uid}>
                                <button
                                    type="button"
                                    onClick={() => handleSelect(message)}
                                    className={[
                                        "w-full text-left px-4 py-3 border-b border-border",
                                        message.uid === selectedUid ? "bg-primary/10" : "hover:bg-surface-alt",
                                        message.flags.read ? "" : "font-semibold",
                                    ].join(" ")}
                                >
                                    <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="truncate">{message.from.displayName || message.from.address}</span>
                                        <span className="text-xs text-text-muted shrink-0">
                                            {new Date(message.receivedDate).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="text-sm truncate">{message.subject || "(no subject)"}</div>
                                    <div className="text-xs text-text-muted truncate font-normal">{message.bodyPreview}</div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
                {!selected ? (
                    <p className="p-8 text-sm text-text-muted">Select a message to read it.</p>
                ) : (
                    <>
                        <div className="border-b border-border p-4">
                            <h1 className="text-lg font-bold tracking-tight">{selected.subject || "(no subject)"}</h1>
                            <p className="text-sm text-text-muted mt-1">
                                From {selected.from.displayName || selected.from.address} &middot;{" "}
                                {new Date(selected.receivedDate).toLocaleString()}
                            </p>
                            <p className="text-sm text-text-muted">
                                To {selected.recipients.map((r) => r.displayName || r.address).join(", ")}
                            </p>
                            {attachments.length > 0 && (
                                <ul className="flex flex-wrap gap-2 mt-3">
                                    {attachments.map((attachment) => (
                                        <li key={attachment.uid}>
                                            <a
                                                href={attachmentContentUrl(attachment.uid)}
                                                className="text-xs font-medium py-1 px-2.5 rounded-pill bg-surface-alt text-text-muted hover:text-primary-dark"
                                            >
                                                {attachment.filename} ({formatBytes(attachment.sizeBytes)})
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <iframe
                            key={selected.uid}
                            title={selected.subject || "Message content"}
                            src={`/api/mail/messages/${encodeURIComponent(selected.uid)}/content`}
                            sandbox=""
                            className="flex-1 w-full border-0"
                        />
                    </>
                )}
            </div>
        </div>
    );
}
