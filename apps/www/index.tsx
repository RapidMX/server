///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../shared/lib/api.js";
import { Message, listMessages } from "../shared/lib/mailApi.js";
import { ConversationSummary, listConversations } from "../shared/lib/conversationsApi.js";
import { useMarkMessageRead, useMessageAttachments } from "../shared/lib/mailDetailHooks.js";
import useIsMobile from "../shared/lib/useIsMobile.js";
import MailShell, { MailShellProps, useMailShell } from "../shared/components/mail/layout/MailShell.js";
import MessageDetailPane from "../shared/components/mail/MessageDetailPane.js";
import ConversationList from "../shared/components/mail/ConversationList.js";
import ConversationThreadPane from "../shared/components/mail/ConversationThreadPane.js";
import Alert from "../shared/components/feedback/Alert.js";

type ViewMode = "date" | "conversation";

export default function InboxPage(props: MailShellProps) {
    return (
        <MailShell {...props}>
            <InboxContent />
        </MailShell>
    );
}

function InboxContent() {
    const { folderUid, mailboxUid, folders } = useMailShell();
    const isMobile = useIsMobile();
    const [viewMode, setViewMode] = useState<ViewMode>("date");
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUid, setSelectedUid] = useState<string | null>(null);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

    // Conversations are computed mailbox-wide (see `conversationsApi.ts`), not scoped to the selected
    // folder — switching into "By conversation" mode replaces the per-folder list entirely, and the
    // folder-tree sidebar's own selection becomes purely informational until switching back to "By date".
    useEffect(() => {
        setSelectedUid(null);
        setSelectedConversationId(null);

        if (viewMode === "conversation") {
            // `mailboxUid` is always set by this point — `MailShell` only ever resolves `folderUid`
            // (this component's own guard just below, gating everything before this effect can even
            // run with `viewMode === "conversation"`) after `mailboxUid` is already known.
            setLoading(true);
            setError(null);
            listConversations(mailboxUid!)
                .then(setConversations)
                .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load conversations."))
                .finally(() => setLoading(false));
            return;
        }

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
    }, [viewMode, folderUid, mailboxUid]);

    const selected = messages.find((m) => m.uid === selectedUid) ?? null;
    const selectedConversation = conversations.find((c) => c.conversationId === selectedConversationId) ?? null;
    const attachments = useMessageAttachments(selected);
    useMarkMessageRead(selected, (updated) => setMessages((prev) => prev.map((m) => (m.uid === updated.uid ? updated : m))));
    const isSentItems = folders.find((f) => f.uid === folderUid)?.type === "sent_items";
    const isOutbox = folders.find((f) => f.uid === folderUid)?.type === "outbox";
    const draftsFolderUid = folders.find((f) => f.type === "drafts")?.uid;

    function handleSelect(message: Message) {
        if (isMobile) {
            window.location.href = `/messages/detail?uid=${encodeURIComponent(message.uid)}`;
            return;
        }
        setSelectedUid(message.uid);
    }

    function handleSelectConversation(conversation: ConversationSummary) {
        if (isMobile) {
            // No dedicated mobile thread route yet — the existing single-message detail route already
            // handles any message uid regardless of conversation grouping, so land on the most recent
            // message in the thread rather than building a second mobile detail page for this phase.
            // `messageUids` always has at least one entry — a `ConversationSummary` only ever exists
            // because it was grouped from real messages (see `BaseMessageRoute.conversations()`).
            const latestUid = conversation.messageUids[conversation.messageUids.length - 1];
            window.location.href = `/messages/detail?uid=${encodeURIComponent(latestUid)}`;
            return;
        }
        setSelectedConversationId(conversation.conversationId);
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
                <div className="flex border-b border-border text-sm">
                    <button
                        type="button"
                        onClick={() => setViewMode("date")}
                        className={[
                            "flex-1 py-2 font-semibold",
                            viewMode === "date" ? "text-primary-dark border-b-2 border-primary-dark" : "text-text-muted",
                        ].join(" ")}
                    >
                        By date
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode("conversation")}
                        className={[
                            "flex-1 py-2 font-semibold",
                            viewMode === "conversation" ? "text-primary-dark border-b-2 border-primary-dark" : "text-text-muted",
                        ].join(" ")}
                    >
                        By conversation
                    </button>
                </div>
                {viewMode === "conversation" && (
                    <p className="p-3 text-xs text-text-muted border-b border-border">
                        Showing every conversation in this mailbox — the selected folder doesn&apos;t filter this view.
                    </p>
                )}

                {error && (
                    <div className="p-4">
                        <Alert>{error}</Alert>
                    </div>
                )}

                {loading ? (
                    <p className="p-4 text-sm text-text-muted">Loading&hellip;</p>
                ) : viewMode === "conversation" ? (
                    <ConversationList
                        conversations={conversations}
                        selectedId={selectedConversationId}
                        onSelect={handleSelectConversation}
                    />
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
                {viewMode === "conversation" ? (
                    <ConversationThreadPane conversation={selectedConversation} folders={folders} />
                ) : (
                    <MessageDetailPane
                        message={selected}
                        attachments={attachments}
                        isSentItems={isSentItems}
                        onRecalled={(updated) => setMessages((prev) => prev.map((m) => (m.uid === updated.uid ? updated : m)))}
                        isOutbox={isOutbox}
                        draftsFolderUid={draftsFolderUid}
                        onScheduledSendCanceled={(updated) => {
                            // The message moved out of the currently-viewed Outbox folder (into Drafts)
                            // — unlike a recall, which patches a message in place, this removes it from
                            // the list entirely, matching what a real folder switch would show.
                            setMessages((prev) => prev.filter((m) => m.uid !== updated.uid));
                            setSelectedUid(null);
                        }}
                    />
                )}
            </div>
        </div>
    );
}
