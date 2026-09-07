///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { ApiRequestError } from "../../shared/lib/api.js";
import {
    Attachment,
    ComposeRecipientInput,
    Message,
    assembleDraft,
    createDraft,
    sendMessage,
    uploadAttachment,
} from "../../shared/lib/mailApi.js";
import MailShell, { MailShellProps, useMailShell } from "../../shared/components/mail/layout/MailShell.js";
import RichTextEditor from "../../shared/components/mail/compose/RichTextEditor.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";
import FormField from "../../shared/components/forms/FormField.js";

const INPUT_CLASS =
    "w-full text-sm py-2.5 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

export default function ComposePage(props: MailShellProps) {
    return (
        <MailShell {...props}>
            <ComposeContent />
        </MailShell>
    );
}

function parseAddresses(value: string): ComposeRecipientInput[] {
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((address) => ({ address }));
}

function ComposeContent() {
    const { mailboxUid, folders } = useMailShell();
    const draftsFolderUid = folders.find((f) => f.type === "drafts")?.uid;

    const [draft, setDraft] = useState<Message | null>(null);
    const [draftError, setDraftError] = useState<string | null>(null);
    const [to, setTo] = useState("");
    const [cc, setCc] = useState("");
    const [bcc, setBcc] = useState("");
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (!mailboxUid || !draftsFolderUid || draft) {
            return;
        }
        createDraft(mailboxUid, draftsFolderUid)
            .then(setDraft)
            .catch((err) => setDraftError(err instanceof ApiRequestError ? err.message : "Could not start a new draft."));
    }, [mailboxUid, draftsFolderUid, draft]);

    async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
        // The explicit annotation matters: e.target.files (through React's generic ChangeEvent<T>)
        // types Array.from(...) as unknown[] otherwise — a TS narrowing quirk through generic
        // property chains, not a real type difference.
        const fileList: FileList | null = e.target.files;
        const files = fileList ? Array.from(fileList) : [];
        e.target.value = "";
        if (!draft || files.length === 0) {
            return;
        }
        setAttachError(null);
        for (const file of files) {
            try {
                const attachment = await uploadAttachment(draft.uid, file);
                setAttachments((prev) => [...prev, attachment]);
            } catch (err) {
                setAttachError(err instanceof ApiRequestError ? err.message : "Could not upload attachment.");
            }
        }
    }

    async function handleSend(e: FormEvent) {
        e.preventDefault();
        if (!draft) {
            return;
        }
        const toRecipients = parseAddresses(to);
        if (toRecipients.length === 0) {
            setSendError("At least one recipient is required.");
            return;
        }

        setSending(true);
        setSendError(null);
        try {
            // No client-side sanitization of `html` here — `sanitize-html` (the library used for this) is a
            // Node-oriented package built on `htmlparser2`; browser-bundling it through this project's plain
            // Vite config for a purely cosmetic defense-in-depth pass isn't worth the added bundle size/
            // fragility when the server-side gate in `BaseMailComposeRoute.assemble()` is already the sole
            // authoritative one regardless (the server never trusts client-submitted HTML any more than it
            // trusts a client-submitted `from` address, which is also always server-derived).
            await assembleDraft(draft.uid, {
                to: toRecipients,
                cc: parseAddresses(cc),
                bcc: parseAddresses(bcc),
                subject,
                html,
            });
            await sendMessage(draft.uid);
            setSent(true);
        } catch (err) {
            setSendError(err instanceof ApiRequestError ? err.message : "Could not send this message.");
        } finally {
            setSending(false);
        }
    }

    if (sent) {
        return (
            <div className="p-8 max-w-xl flex flex-col gap-4">
                <p className="text-sm font-medium text-success">Message sent.</p>
                <a href="/" className="text-sm text-primary-dark hover:underline">
                    &larr; Back to Inbox
                </a>
            </div>
        );
    }

    return (
        <form onSubmit={handleSend} className="max-w-3xl mx-auto p-6 flex flex-col gap-1">
            <h1 className="text-lg font-bold tracking-tight mb-3">New Message</h1>

            {draftError && <Alert>{draftError}</Alert>}
            {sendError && <Alert>{sendError}</Alert>}
            {attachError && <Alert>{attachError}</Alert>}

            <FormField label="To" htmlFor="compose-to">
                <input
                    id="compose-to"
                    type="text"
                    className={INPUT_CLASS}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="recipient@example.com, another@example.com"
                />
            </FormField>

            {!showCcBcc ? (
                <button
                    type="button"
                    onClick={() => setShowCcBcc(true)}
                    className="self-start text-xs font-medium text-primary-dark hover:underline mb-3"
                >
                    Add Cc/Bcc
                </button>
            ) : (
                <>
                    <FormField label="Cc" htmlFor="compose-cc">
                        <input id="compose-cc" type="text" className={INPUT_CLASS} value={cc} onChange={(e) => setCc(e.target.value)} />
                    </FormField>
                    <FormField label="Bcc" htmlFor="compose-bcc">
                        <input id="compose-bcc" type="text" className={INPUT_CLASS} value={bcc} onChange={(e) => setBcc(e.target.value)} />
                    </FormField>
                </>
            )}

            <FormField label="Subject" htmlFor="compose-subject">
                <input
                    id="compose-subject"
                    type="text"
                    className={INPUT_CLASS}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                />
            </FormField>

            <FormField label="Message" htmlFor="compose-body">
                <RichTextEditor value={html} onChange={setHtml} />
            </FormField>

            <FormField label="Attachments" htmlFor="compose-attachments">
                <input id="compose-attachments" type="file" multiple disabled={!draft} onChange={handleFilesSelected} />
                {attachments.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {attachments.map((attachment) => (
                            <li
                                key={attachment.uid}
                                className="text-xs font-medium py-1 px-2.5 rounded-pill bg-surface-alt text-text-muted"
                            >
                                {attachment.filename}
                            </li>
                        ))}
                    </ul>
                )}
            </FormField>

            <div className="flex gap-3 mt-2">
                <Button type="submit" loading={sending} disabled={!draft || sending} className="!w-auto">
                    Send
                </Button>
                <a href="/">
                    <Button type="button" variant="secondary" className="!w-auto">
                        Discard
                    </Button>
                </a>
            </div>
        </form>
    );
}
