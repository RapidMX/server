///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../shared/lib/api.js";
import { Contact, deleteContact, getContact } from "../../../shared/lib/contactsApi.js";
import ContactsShell, { ContactsShellProps } from "../../../shared/components/contacts/layout/ContactsShell.js";
import ContactDetailPane from "../../../shared/components/contacts/ContactDetailPane.js";
import ContactForm from "../../../shared/components/contacts/ContactForm.js";
import Alert from "../../../shared/components/feedback/Alert.js";

/**
 * This framework has no dynamic route segments (see `ReactRoute`'s file-convention resolver) — the target
 * contact's uid comes from the query string instead, same convention as the admin console's mailbox detail
 * page. Only reached on mobile (below the `md` breakpoint) — desktop's `apps/www/contacts/index.tsx` keeps
 * its existing inline detail pane and never navigates here; see that file's `handleSelectRow`. There is no
 * equivalent "new contact" route — an unsaved contact has no uid for a query param, so creation stays an
 * in-place mode-switch on every device (see `apps/www/contacts/index.tsx`'s `handleNew`).
 */
export function readTargetUid(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("uid");
}

export default function ContactDetailPage(props: ContactsShellProps) {
    return (
        <ContactsShell {...props}>
            <ContactDetailContent />
        </ContactsShell>
    );
}

type Mode = "view" | "edit";

function ContactDetailContent() {
    const [uid, setUid] = useState<string | null>(null);
    const [contact, setContact] = useState<Contact | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");

    useEffect(() => {
        setUid(readTargetUid());
    }, []);

    useEffect(() => {
        if (!uid) {
            return;
        }
        setLoading(true);
        setError(null);
        getContact(uid)
            .then(setContact)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this contact."))
            .finally(() => setLoading(false));
    }, [uid]);

    // Takes `contact` as a parameter rather than reading it from the closure/state — mirrors the desktop
    // pane's own `handleDelete` in `apps/www/contacts/index.tsx`. The only caller (below) is only ever
    // rendered once `contact` is already resolved (see the `error || !contact` guard above it), so this
    // never runs with a stale/absent contact — no redundant null check needed here.
    async function handleDelete(contact: Contact) {
        try {
            await deleteContact(contact.uid, contact.version);
            window.location.href = "/contacts";
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not delete this contact.");
        }
    }

    if (!uid) {
        return <Alert>No contact specified.</Alert>;
    }
    if (loading) {
        return <p className="p-8 text-sm text-text-muted">Loading&hellip;</p>;
    }
    if (error || !contact) {
        return <Alert>{error ?? "Contact not found."}</Alert>;
    }

    const backHref = "/contacts";
    if (mode === "edit") {
        return (
            <div className="p-6">
                <a href={backHref} className="text-sm text-primary-dark hover:underline block mb-4">
                    &larr; Back to contacts
                </a>
                <ContactForm
                    contact={contact}
                    onSaved={(saved) => {
                        setContact(saved);
                        setMode("view");
                    }}
                    onCancel={() => setMode("view")}
                />
            </div>
        );
    }

    return (
        <div className="p-6">
            <ContactDetailPane contact={contact} onEdit={() => setMode("edit")} onDelete={() => handleDelete(contact)} backHref={backHref} />
        </div>
    );
}
