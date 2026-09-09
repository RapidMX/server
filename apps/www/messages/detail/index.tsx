///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../shared/lib/api.js";
import { Message, getMessage } from "../../../shared/lib/mailApi.js";
import { useMarkMessageRead, useMessageAttachments } from "../../../shared/lib/mailDetailHooks.js";
import MailShell, { MailShellProps, useMailShell } from "../../../shared/components/mail/layout/MailShell.js";
import MessageDetailPane from "../../../shared/components/mail/MessageDetailPane.js";
import Alert from "../../../shared/components/feedback/Alert.js";

/**
 * This framework has no dynamic route segments (see `ReactRoute`'s file-convention resolver) — the target
 * message's uid comes from the query string instead, same convention as the admin console's mailbox detail
 * page. Only reached on mobile (below the `md` breakpoint) — desktop's `apps/www/index.tsx` keeps its
 * existing inline reading pane and never navigates here; see that file's `handleSelect`.
 */
export function readTargetUid(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("uid");
}

export default function MessageDetailPage(props: MailShellProps) {
    return (
        <MailShell {...props}>
            <MessageDetailContent />
        </MailShell>
    );
}

function MessageDetailContent() {
    const { folders } = useMailShell();
    const [uid, setUid] = useState<string | null>(null);
    const [message, setMessage] = useState<Message | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setUid(readTargetUid());
    }, []);

    useEffect(() => {
        if (!uid) {
            return;
        }
        setLoading(true);
        setError(null);
        getMessage(uid)
            .then(setMessage)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this message."))
            .finally(() => setLoading(false));
    }, [uid]);

    const attachments = useMessageAttachments(message);
    useMarkMessageRead(message, setMessage);

    if (!uid) {
        return <Alert>No message specified.</Alert>;
    }
    if (loading) {
        return <p className="p-8 text-sm text-text-muted">Loading&hellip;</p>;
    }
    if (error || !message) {
        return <Alert>{error ?? "Message not found."}</Alert>;
    }

    const backHref = `/?mailboxUid=${encodeURIComponent(message.mailboxUid)}&folderUid=${encodeURIComponent(message.folderUid)}`;
    const isSentItems = folders.find((f) => f.uid === message.folderUid)?.type === "sent_items";
    const isOutbox = folders.find((f) => f.uid === message.folderUid)?.type === "outbox";
    const isInbox = folders.find((f) => f.uid === message.folderUid)?.type === "inbox";
    const draftsFolderUid = folders.find((f) => f.type === "drafts")?.uid;
    return (
        <MessageDetailPane
            message={message}
            attachments={attachments}
            backHref={backHref}
            isSentItems={isSentItems}
            onRecalled={setMessage}
            isOutbox={isOutbox}
            isInbox={isInbox}
            onClassified={setMessage}
            onReceiptHandled={setMessage}
            draftsFolderUid={draftsFolderUid}
            onScheduledSendCanceled={setMessage}
        />
    );
}
