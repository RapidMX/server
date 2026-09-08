///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../shared/lib/api.js";
import { Message, listMessages } from "../shared/lib/mailApi.js";
import { useMarkMessageRead, useMessageAttachments } from "../shared/lib/mailDetailHooks.js";
import useIsMobile from "../shared/lib/useIsMobile.js";
import MailShell, { MailShellProps, useMailShell } from "../shared/components/mail/layout/MailShell.js";
import MessageDetailPane from "../shared/components/mail/MessageDetailPane.js";
import Alert from "../shared/components/feedback/Alert.js";

export default function InboxPage(props: MailShellProps) {
    return (
        <MailShell {...props}>
            <InboxContent />
        </MailShell>
    );
}

function InboxContent() {
    const { folderUid } = useMailShell();
    const isMobile = useIsMobile();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUid, setSelectedUid] = useState<string | null>(null);

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
    const attachments = useMessageAttachments(selected);
    useMarkMessageRead(selected, (updated) => setMessages((prev) => prev.map((m) => (m.uid === updated.uid ? updated : m))));

    function handleSelect(message: Message) {
        if (isMobile) {
            window.location.href = `/messages/detail?uid=${encodeURIComponent(message.uid)}`;
            return;
        }
        setSelectedUid(message.uid);
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
            <div className="w-full md:w-96 shrink-0 md:border-r border-border overflow-y-auto">
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
            <div className="hidden md:flex flex-1 min-w-0">
                <MessageDetailPane message={selected} attachments={attachments} />
            </div>
        </div>
    );
}
