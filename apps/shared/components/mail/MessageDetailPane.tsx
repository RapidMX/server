///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { Attachment, Message, attachmentContentUrl } from "../../lib/mailApi.js";

export interface MessageDetailPaneProps {
    message: Message | null;
    attachments: Attachment[];
    /** Present only on the mobile detail route — renders a "back to messages" link above the header. Absent
     * on the desktop reading pane, which never navigates away (selecting a different message just swaps
     * `message` in place). */
    backHref?: string;
}

function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
}

/**
 * A message's reading pane — header (subject/from/to/attachments) plus a sandboxed iframe for the body.
 * Shared by the desktop inline pane (`apps/www/index.tsx`, always visible alongside the message list) and
 * the mobile detail route (`apps/www/messages/detail/index.tsx`, a full page on its own reached by tapping
 * a message row) — see each call site for how `message`/`attachments` are sourced.
 */
export default function MessageDetailPane({ message, attachments, backHref }: MessageDetailPaneProps) {
    if (!message) {
        return <p className="p-8 text-sm text-text-muted">Select a message to read it.</p>;
    }

    return (
        <div className="flex-1 min-w-0 flex flex-col">
            <div className="border-b border-border p-4">
                {backHref && (
                    <a href={backHref} className="text-sm text-primary-dark hover:underline block mb-2">
                        &larr; Back to messages
                    </a>
                )}
                <h1 className="text-lg font-bold tracking-tight">{message.subject || "(no subject)"}</h1>
                <p className="text-sm text-text-muted mt-1">
                    From {message.from.displayName || message.from.address} &middot;{" "}
                    {new Date(message.receivedDate).toLocaleString()}
                </p>
                <p className="text-sm text-text-muted">
                    To {message.recipients.map((r) => r.displayName || r.address).join(", ")}
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
                key={message.uid}
                title={message.subject || "Message content"}
                src={`/api/mail/messages/${encodeURIComponent(message.uid)}/content`}
                sandbox=""
                className="flex-1 w-full border-0"
            />
        </div>
    );
}
