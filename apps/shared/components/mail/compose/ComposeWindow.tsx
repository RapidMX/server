///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ChangeEvent, useEffect, useState } from "react";
import {
    HiOutlineArrowsPointingIn,
    HiOutlineArrowsPointingOut,
    HiOutlineMinus,
    HiOutlinePaperClip,
    HiOutlineTrash,
    HiOutlineXMark,
} from "react-icons/hi2";
import { ApiRequestError } from "../../../lib/api.js";
import {
    Attachment,
    ComposeRecipientInput,
    Message,
    assembleDraft,
    createDraft,
    listFolders,
    sendMessage,
    uploadAttachment,
} from "../../../lib/mailApi.js";
import type { ComposeSession } from "./ComposeContext.js";
import RichTextEditor from "./RichTextEditor.js";
import Alert from "../../feedback/Alert.js";

export interface ComposeWindowProps {
    session: ComposeSession;
    onClose: () => void;
    onToggleMinimize: () => void;
}

const FIELD_ROW = "flex items-center gap-2 px-3 py-1.5 border-b border-border";
const FIELD_INPUT = "flex-1 min-w-0 text-sm bg-transparent outline-none";

function parseAddresses(value: string): ComposeRecipientInput[] {
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((address) => ({ address }));
}

function HeaderButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: React.ComponentType<{ size?: number }> }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className="w-6 h-6 flex items-center justify-center rounded-sm text-white/80 hover:bg-white/15 hover:text-white"
        >
            <Icon size={14} />
        </button>
    );
}

/**
 * A floating, Gmail-style compose window — overlays whatever app is currently showing instead of
 * navigating to a dedicated page (see `ComposeContext.tsx`'s doc comment for why: a full-page compose
 * form meant losing your place in the inbox/calendar/contacts view behind it, and every navigation to
 * `/compose` re-ran this whole app's full mailbox/folder resolution waterfall from scratch). Owns its
 * own draft lifecycle end to end (unlike the old page, which read the Drafts folder from `MailShell`'s
 * context — this window can be opened from apps that never mount `MailShell` at all, e.g. Contacts'
 * "Email" action, so it resolves its own Drafts folder from just a `mailboxUid`).
 */
export default function ComposeWindow({ session, onClose, onToggleMinimize }: ComposeWindowProps) {
    const { id, mailboxUid, initialTo, minimized } = session;

    const [draftsFolderUid, setDraftsFolderUid] = useState<string | undefined>();
    const [folderError, setFolderError] = useState<string | null>(null);
    const [draft, setDraft] = useState<Message | null>(null);
    const [draftError, setDraftError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [to, setTo] = useState(initialTo ?? "");
    const [cc, setCc] = useState("");
    const [bcc, setBcc] = useState("");
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        listFolders(mailboxUid)
            .then((folders) => setDraftsFolderUid(folders.find((f) => f.type === "drafts")?.uid))
            .catch((err) => setFolderError(err instanceof ApiRequestError ? err.message : "Could not load your Drafts folder."));
    }, [mailboxUid]);

    useEffect(() => {
        if (!draftsFolderUid || draft) {
            return;
        }
        createDraft(mailboxUid, draftsFolderUid)
            .then(setDraft)
            .catch((err) => setDraftError(err instanceof ApiRequestError ? err.message : "Could not start a new draft."));
    }, [mailboxUid, draftsFolderUid, draft]);

    // The "Attach files" input is itself `disabled` until `draft` resolves (see its `disabled={!draft}`
    // below), so this can only ever fire once `draft` is set — no defensive null check needed, matching
    // this codebase's established pattern for the same class of "always non-null by the time it's
    // called" value (e.g. `ComposeToolbar.run()`). No separate empty-`files` guard either: the loop
    // below is already a no-op when there's nothing to iterate.
    async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        setAttachError(null);
        for (const file of files) {
            try {
                const attachment = await uploadAttachment(draft!.uid, file);
                setAttachments((prev) => [...prev, attachment]);
            } catch (err) {
                setAttachError(err instanceof ApiRequestError ? err.message : "Could not upload attachment.");
            }
        }
    }

    // Same reasoning as `handleFilesSelected` above: the Send button is itself `disabled` until `draft`
    // resolves, so this is never reachable with a null `draft`.
    async function handleSend() {
        const toRecipients = parseAddresses(to);
        if (toRecipients.length === 0) {
            setSendError("At least one recipient is required.");
            return;
        }

        setSending(true);
        setSendError(null);
        try {
            // See the old compose page's identical note: `sanitize-html` is Node-oriented and the server-side
            // gate in `BaseMailComposeRoute.assemble()` is the sole authoritative sanitizer regardless, so no
            // client-side pass is done here either.
            await assembleDraft(draft!.uid, {
                to: toRecipients,
                cc: parseAddresses(cc),
                bcc: parseAddresses(bcc),
                subject,
                html,
            });
            await sendMessage(draft!.uid);
            onClose();
        } catch (err) {
            setSendError(err instanceof ApiRequestError ? err.message : "Could not send this message.");
        } finally {
            setSending(false);
        }
    }

    const title = subject.trim() || "New Message";
    const titleId = `compose-title-${id}`;

    if (minimized) {
        return (
            <div role="dialog" aria-label={title} className="w-64 shrink-0 bg-surface border border-border border-b-0 rounded-t-md shadow-modal">
                <div
                    className="h-10 flex items-center justify-between gap-2 px-3 rounded-t-md bg-primary-darker text-white cursor-pointer"
                    onClick={onToggleMinimize}
                >
                    <span className="text-sm font-medium truncate">{title}</span>
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <HeaderButton label="Restore" onClick={onToggleMinimize} icon={HiOutlineArrowsPointingOut} />
                        <HeaderButton
                            label="Discard draft"
                            onClick={onClose}
                            icon={HiOutlineXMark}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            role="dialog"
            aria-labelledby={titleId}
            className={[
                "shrink-0 flex flex-col bg-surface border border-border border-b-0 rounded-t-md shadow-modal overflow-hidden",
                expanded ? "w-[720px] h-[85vh]" : "w-[480px] h-[520px]",
            ].join(" ")}
        >
            <div
                className="h-10 shrink-0 flex items-center justify-between gap-2 px-3 bg-primary-darker text-white cursor-pointer"
                onClick={onToggleMinimize}
            >
                <span id={titleId} className="text-sm font-medium truncate">
                    {title}
                </span>
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <HeaderButton label="Minimize" onClick={onToggleMinimize} icon={HiOutlineMinus} />
                    <HeaderButton
                        label={expanded ? "Collapse" : "Expand"}
                        onClick={() => setExpanded((v) => !v)}
                        icon={expanded ? HiOutlineArrowsPointingIn : HiOutlineArrowsPointingOut}
                    />
                    <HeaderButton label="Close" onClick={onClose} icon={HiOutlineXMark} />
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
                {(folderError || draftError || sendError || attachError) && (
                    <div className="px-3 pt-2">
                        {folderError && <Alert>{folderError}</Alert>}
                        {draftError && <Alert>{draftError}</Alert>}
                        {sendError && <Alert>{sendError}</Alert>}
                        {attachError && <Alert>{attachError}</Alert>}
                    </div>
                )}

                <div className={FIELD_ROW}>
                    <label htmlFor={`compose-to-${id}`} className="text-xs text-text-muted shrink-0">
                        To
                    </label>
                    <input
                        id={`compose-to-${id}`}
                        type="text"
                        className={FIELD_INPUT}
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                    {!showCcBcc && (
                        <button
                            type="button"
                            onClick={() => setShowCcBcc(true)}
                            className="text-xs text-text-muted hover:text-text shrink-0"
                        >
                            Cc Bcc
                        </button>
                    )}
                </div>

                {showCcBcc && (
                    <>
                        <div className={FIELD_ROW}>
                            <label htmlFor={`compose-cc-${id}`} className="text-xs text-text-muted shrink-0">
                                Cc
                            </label>
                            <input id={`compose-cc-${id}`} type="text" className={FIELD_INPUT} value={cc} onChange={(e) => setCc(e.target.value)} />
                        </div>
                        <div className={FIELD_ROW}>
                            <label htmlFor={`compose-bcc-${id}`} className="text-xs text-text-muted shrink-0">
                                Bcc
                            </label>
                            <input id={`compose-bcc-${id}`} type="text" className={FIELD_INPUT} value={bcc} onChange={(e) => setBcc(e.target.value)} />
                        </div>
                    </>
                )}

                <div className={FIELD_ROW}>
                    <input
                        aria-label="Subject"
                        type="text"
                        placeholder="Subject"
                        className={FIELD_INPUT}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                    />
                </div>

                <div className="flex-1 min-h-0 p-2">
                    <RichTextEditor value={html} onChange={setHtml} fill />
                </div>

                {attachments.length > 0 && (
                    <ul className="flex flex-wrap gap-2 px-3 pb-2">
                        {attachments.map((attachment) => (
                            <li key={attachment.uid} className="text-xs font-medium py-1 px-2.5 rounded-pill bg-surface-alt text-text-muted">
                                {attachment.filename}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-t border-border">
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={!draft || sending}
                        className="py-1.5 px-5 rounded-pill font-semibold text-sm bg-primary text-white hover:not-disabled:bg-primary-dark disabled:opacity-55 disabled:cursor-not-allowed"
                    >
                        {sending ? "Sending…" : "Send"}
                    </button>

                    <label
                        aria-label="Attach files"
                        title="Attach files"
                        className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface-alt hover:text-text cursor-pointer has-[:disabled]:opacity-40 has-[:disabled]:cursor-not-allowed"
                    >
                        <HiOutlinePaperClip size={18} />
                        <input type="file" multiple disabled={!draft} onChange={handleFilesSelected} className="sr-only" />
                    </label>

                    <button
                        type="button"
                        aria-label="Discard draft"
                        title="Discard draft"
                        onClick={onClose}
                        className="ml-auto w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface-alt hover:text-text"
                    >
                        <HiOutlineTrash size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
