///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiRequestError } from "../../shared/lib/api.js";
import {
    Contact,
    ContactAddressKind,
    ContactEmail,
    ContactPhone,
    ContactPostalAddress,
    createContact,
    deleteContact,
    listContacts,
    listDeletedContacts,
    setContactFavorite,
    updateContact,
} from "../../shared/lib/contactsApi.js";
import { contactsToVCardFile, contactToVCard, parseVCards } from "../../shared/lib/vcard.js";
import { useCompose } from "../../shared/components/mail/compose/ComposeContext.js";
import ContactsShell, { ContactsShellProps, useContactsShell } from "../../shared/components/contacts/layout/ContactsShell.js";
import ContactsSidebar, { ContactsView } from "../../shared/components/contacts/ContactsSidebar.js";
import ContactsToolbar from "../../shared/components/contacts/ContactsToolbar.js";
import ContactAvatar from "../../shared/components/contacts/ContactAvatar.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";
import FormField from "../../shared/components/forms/FormField.js";

const INPUT_CLASS =
    "w-full text-sm py-2 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";
const SELECT_CLASS =
    "text-sm py-2 px-2 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

export default function ContactsPage(props: ContactsShellProps) {
    return (
        <ContactsShell {...props}>
            <ContactsContent />
        </ContactsShell>
    );
}

type Mode = "view" | "edit" | "new";
type SortColumn = "name" | "info";

function primaryInfo(contact: Contact): string {
    return contact.emails[0]?.address ?? contact.phones[0]?.phoneNumber ?? "";
}

function downloadTextFile(filename: string, content: string): void {
    const blob = new Blob([content], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function ContactsContent() {
    const { folderUid, mailboxUid } = useContactsShell();
    const { openCompose } = useCompose();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [deletedContacts, setDeletedContacts] = useState<Contact[]>([]);
    const [deletedLoading, setDeletedLoading] = useState(false);
    const [deletedError, setDeletedError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [view, setView] = useState<ContactsView>({ type: "all" });
    const [sortColumn, setSortColumn] = useState<SortColumn>("name");
    const [sortDesc, setSortDesc] = useState(false);
    const [checkedUids, setCheckedUids] = useState<Set<string>>(new Set());
    const [selectedUid, setSelectedUid] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");

    /** Returns a promise so bulk actions (below) can wait for the refreshed list before re-asserting their
     * own error message — this always clears `error` first (a legitimate reset for a fresh fetch attempt),
     * which would otherwise silently wipe out a bulk action's own just-set failure message before the user
     * ever saw it, since every bulk handler calls this right after its own error-setting loop. */
    function reload(): Promise<void> {
        if (!folderUid) {
            setContacts([]);
            setLoading(false);
            return Promise.resolve();
        }
        setLoading(true);
        setError(null);
        return listContacts(folderUid, { limit: 500 })
            .then(setContacts)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load contacts."))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        void reload();
    }, [folderUid]);

    useEffect(() => {
        if (view.type !== "deleted" || !folderUid) {
            return;
        }
        setDeletedLoading(true);
        setDeletedError(null);
        listDeletedContacts(folderUid, { limit: 500 })
            .then(setDeletedContacts)
            .catch((err) => setDeletedError(err instanceof ApiRequestError ? err.message : "Could not load deleted contacts."))
            .finally(() => setDeletedLoading(false));
        // Re-fetches every time the Deleted view is (re-)selected, matching this page's own `reload()`
        // convention elsewhere rather than caching a possibly-stale list across visits.
    }, [view, folderUid]);

    const viewFiltered = useMemo(() => {
        switch (view.type) {
            case "all":
                return contacts;
            case "favorites":
                return contacts.filter((c) => c.favorite);
            case "list":
                return contacts.filter((c) => c.contactListUid === view.uid);
            case "category":
                return contacts.filter((c) => (c.categories ?? []).includes(view.name));
            case "deleted":
                return deletedContacts;
        }
    }, [contacts, deletedContacts, view]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            return viewFiltered;
        }
        return viewFiltered.filter(
            (c) => c.displayName.toLowerCase().includes(q) || c.emails.some((e) => e.address.toLowerCase().includes(q)),
        );
    }, [viewFiltered, query]);

    const sorted = useMemo(() => {
        const arr = [...filtered];
        arr.sort((a, b) => {
            const cmp = (sortColumn === "name" ? a.displayName : primaryInfo(a)).localeCompare(
                sortColumn === "name" ? b.displayName : primaryInfo(b),
            );
            return sortDesc ? -cmp : cmp;
        });
        return arr;
    }, [filtered, sortColumn, sortDesc]);

    const selected = contacts.find((c) => c.uid === selectedUid) ?? null;
    const isDeletedView = view.type === "deleted";
    const checkedContacts = sorted.filter((c) => checkedUids.has(c.uid));
    const allChecked = sorted.length > 0 && sorted.every((c) => checkedUids.has(c.uid));

    function handleSort(column: SortColumn) {
        if (column === sortColumn) {
            setSortDesc((prev) => !prev);
        } else {
            setSortColumn(column);
            setSortDesc(false);
        }
    }

    function toggleChecked(uid: string) {
        setCheckedUids((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) {
                next.delete(uid);
            } else {
                next.add(uid);
            }
            return next;
        });
    }

    function toggleCheckAll() {
        setCheckedUids(allChecked ? new Set() : new Set(sorted.map((c) => c.uid)));
    }

    function handleSelectView(next: ContactsView) {
        setView(next);
        setCheckedUids(new Set());
    }

    function handleSelectRow(contact: Contact) {
        setSelectedUid(contact.uid);
        setMode("view");
    }

    function handleNew() {
        setSelectedUid(null);
        setMode("new");
    }

    function handleSaved(contact: Contact) {
        setSelectedUid(contact.uid);
        setMode("view");
        void reload();
    }

    function handleCancel() {
        setMode("view");
    }

    async function handleDelete(contact: Contact) {
        try {
            await deleteContact(contact.uid, contact.version);
            setSelectedUid(null);
            setMode("view");
            void reload();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not delete this contact.");
        }
    }

    async function handleBulkDelete() {
        let bulkError: string | null = null;
        for (const contact of checkedContacts) {
            try {
                await deleteContact(contact.uid, contact.version);
            } catch (err) {
                bulkError = err instanceof ApiRequestError ? err.message : "Could not delete one or more contacts.";
            }
        }
        setCheckedUids(new Set());
        await reload();
        setError(bulkError);
    }

    // `ContactsToolbar`'s Edit button — the only caller — is itself `disabled` unless exactly one contact
    // is checked, so `checkedContacts[0]` is guaranteed to exist whenever this actually runs; no length
    // guard needed, matching this codebase's established pattern for the same class of "always non-empty
    // by the time it's called" value guaranteed by a disabled control (see `ComposeToolbar.run()`).
    function handleToolbarEdit() {
        setSelectedUid(checkedContacts[0].uid);
        setMode("edit");
    }

    function handleEmail() {
        const addresses = checkedContacts.map((c) => c.emails[0]?.address).filter((a): a is string => Boolean(a));
        // `ContactsShell` only ever renders this component once `mailboxUid` is resolved (see its own
        // invariant comment) — same non-null pattern as `organizerAddress` in the calendar page.
        openCompose({ mailboxUid: mailboxUid!, to: addresses.join(", ") });
    }

    async function handleToggleFavorite() {
        const allFavorited = checkedContacts.every((c) => c.favorite);
        let bulkError: string | null = null;
        for (const contact of checkedContacts) {
            try {
                await setContactFavorite(contact, !allFavorited);
            } catch (err) {
                bulkError = err instanceof ApiRequestError ? err.message : "Could not update one or more contacts.";
            }
        }
        await reload();
        setError(bulkError);
    }

    async function handleAddCategory() {
        const category = window.prompt("Category name");
        if (!category?.trim()) {
            return;
        }
        let bulkError: string | null = null;
        for (const contact of checkedContacts) {
            const categories = Array.from(new Set([...(contact.categories ?? []), category.trim()]));
            try {
                await updateContact({ ...contact, categories });
            } catch (err) {
                bulkError = err instanceof ApiRequestError ? err.message : "Could not update one or more contacts.";
            }
        }
        await reload();
        setError(bulkError);
    }

    function handleExportVCard() {
        downloadTextFile(
            checkedContacts.length === 1 ? `${checkedContacts[0].displayName}.vcf` : "contacts.vcf",
            checkedContacts.length === 1 ? contactToVCard(checkedContacts[0]) : contactsToVCardFile(checkedContacts),
        );
    }

    async function handleImportFile(file: File) {
        if (!mailboxUid || !folderUid) {
            return;
        }
        const text = await file.text();
        const parsed = parseVCards(text);
        let bulkError: string | null = null;
        for (const input of parsed) {
            try {
                await createContact({ mailboxUid, folderUid, ...input });
            } catch (err) {
                bulkError = err instanceof ApiRequestError ? err.message : "Could not import one or more contacts.";
            }
        }
        await reload();
        setError(bulkError);
    }

    return (
        <div className="flex-1 flex min-h-0">
            <ContactsSidebar mailboxUid={mailboxUid} contacts={contacts} active={view} onSelect={handleSelectView} />
            <div className="w-96 shrink-0 border-r border-border flex flex-col min-h-0">
                <ContactsToolbar
                    selectedCount={checkedContacts.length}
                    allSelectedFavorited={checkedContacts.length > 0 && checkedContacts.every((c) => c.favorite)}
                    onNewContact={handleNew}
                    onEdit={handleToolbarEdit}
                    onDelete={handleBulkDelete}
                    onEmail={handleEmail}
                    onToggleFavorite={handleToggleFavorite}
                    onAddCategory={handleAddCategory}
                    onExportVCard={handleExportVCard}
                    onImportFile={handleImportFile}
                />
                <div className="p-3 border-b border-border">
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search contacts"
                        aria-label="Search contacts"
                        className={INPUT_CLASS}
                    />
                </div>
                {error && (
                    <div className="p-3">
                        <Alert>{error}</Alert>
                    </div>
                )}
                {deletedError && isDeletedView && (
                    <div className="p-3">
                        <Alert>{deletedError}</Alert>
                    </div>
                )}
                {(isDeletedView ? deletedLoading : loading) ? (
                    <p className="p-4 text-sm text-text-muted">Loading&hellip;</p>
                ) : sorted.length === 0 ? (
                    <p className="p-4 text-sm text-text-muted">No contacts found.</p>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left">
                                    {!isDeletedView && (
                                        <th className="w-8 px-3 py-2">
                                            <input
                                                type="checkbox"
                                                aria-label="Select all contacts"
                                                checked={allChecked}
                                                onChange={toggleCheckAll}
                                            />
                                        </th>
                                    )}
                                    <th className="px-3 py-2">
                                        <button
                                            type="button"
                                            onClick={() => handleSort("name")}
                                            className="text-xs font-bold uppercase tracking-wide text-text-muted"
                                        >
                                            Name{sortColumn === "name" ? (sortDesc ? " ▾" : " ▴") : ""}
                                        </button>
                                    </th>
                                    <th className="px-3 py-2">
                                        <button
                                            type="button"
                                            onClick={() => handleSort("info")}
                                            className="text-xs font-bold uppercase tracking-wide text-text-muted"
                                        >
                                            Contact info{sortColumn === "info" ? (sortDesc ? " ▾" : " ▴") : ""}
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((contact) => (
                                    <tr
                                        key={contact.uid}
                                        className={["border-b border-border", contact.uid === selectedUid ? "bg-primary/10" : "hover:bg-surface-alt"].join(
                                            " ",
                                        )}
                                    >
                                        {!isDeletedView && (
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Select ${contact.displayName}`}
                                                    checked={checkedUids.has(contact.uid)}
                                                    onChange={() => toggleChecked(contact.uid)}
                                                />
                                            </td>
                                        )}
                                        <td className="px-3 py-2">
                                            <button type="button" onClick={() => handleSelectRow(contact)} className="flex items-center gap-2 text-left">
                                                <ContactAvatar displayName={contact.displayName} size={28} />
                                                <span className="truncate font-medium">
                                                    {contact.displayName}
                                                    {contact.favorite && <span aria-label="Favorite"> ★</span>}
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-text-muted truncate">{primaryInfo(contact)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0 overflow-y-auto p-6">
                {mode === "new" && mailboxUid && folderUid ? (
                    <ContactForm mailboxUid={mailboxUid} folderUid={folderUid} onSaved={handleSaved} onCancel={handleCancel} />
                ) : mode === "edit" && selected ? (
                    <ContactForm contact={selected} onSaved={handleSaved} onCancel={handleCancel} />
                ) : selected ? (
                    <ContactDetail contact={selected} onEdit={() => setMode("edit")} onDelete={() => handleDelete(selected)} />
                ) : (
                    <p className="text-sm text-text-muted">Select a contact, or create a new one.</p>
                )}
            </div>
        </div>
    );
}

function ContactDetail({ contact, onEdit, onDelete }: { contact: Contact; onEdit: () => void; onDelete: () => void }) {
    return (
        <div role="region" aria-label="Contact details" className="max-w-xl flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <ContactAvatar displayName={contact.displayName} size={48} />
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{contact.displayName}</h1>
                        {contact.jobTitle && contact.company && (
                            <p className="text-sm text-text-muted mt-0.5">
                                {contact.jobTitle} at {contact.company}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button type="button" variant="secondary" className="!w-auto" onClick={onEdit}>
                        Edit
                    </Button>
                    <Button type="button" variant="secondary" className="!w-auto text-danger" onClick={onDelete}>
                        Delete
                    </Button>
                </div>
            </div>

            <div className="bg-surface border border-border rounded-md p-6 flex flex-col gap-4 text-sm">
                {contact.emails.length > 0 && (
                    <div>
                        <div className="text-text-muted text-xs font-bold uppercase tracking-wide mb-1">Email</div>
                        {contact.emails.map((e, i) => (
                            <div key={i}>
                                {e.address} <span className="text-text-muted">({e.type})</span>
                            </div>
                        ))}
                    </div>
                )}
                {contact.phones.length > 0 && (
                    <div>
                        <div className="text-text-muted text-xs font-bold uppercase tracking-wide mb-1">Phone</div>
                        {contact.phones.map((p, i) => (
                            <div key={i}>
                                {p.phoneNumber} <span className="text-text-muted">({p.type})</span>
                            </div>
                        ))}
                    </div>
                )}
                {contact.addresses.length > 0 && (
                    <div>
                        <div className="text-text-muted text-xs font-bold uppercase tracking-wide mb-1">Address</div>
                        {contact.addresses.map((a, i) => (
                            <div key={i}>{[a.street, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(", ")}</div>
                        ))}
                    </div>
                )}
                {contact.categories && contact.categories.length > 0 && (
                    <div>
                        <div className="text-text-muted text-xs font-bold uppercase tracking-wide mb-1">Categories</div>
                        <div>{contact.categories.join(", ")}</div>
                    </div>
                )}
                {contact.notes && (
                    <div>
                        <div className="text-text-muted text-xs font-bold uppercase tracking-wide mb-1">Notes</div>
                        <div>{contact.notes}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface ContactFormProps {
    contact?: Contact;
    mailboxUid?: string;
    folderUid?: string;
    onSaved: (contact: Contact) => void;
    onCancel: () => void;
}

const ADDRESS_KINDS: ContactAddressKind[] = ["home", "work", "other"];

function ContactForm({ contact, mailboxUid, folderUid, onSaved, onCancel }: ContactFormProps) {
    const [displayName, setDisplayName] = useState(contact?.displayName ?? "");
    const [givenName, setGivenName] = useState(contact?.givenName ?? "");
    const [surname, setSurname] = useState(contact?.surname ?? "");
    const [company, setCompany] = useState(contact?.company ?? "");
    const [jobTitle, setJobTitle] = useState(contact?.jobTitle ?? "");
    const [notes, setNotes] = useState(contact?.notes ?? "");
    const [favorite, setFavorite] = useState(contact?.favorite ?? false);
    const [categoriesText, setCategoriesText] = useState((contact?.categories ?? []).join(", "));
    const [emails, setEmails] = useState<ContactEmail[]>(contact?.emails ?? []);
    const [phones, setPhones] = useState<ContactPhone[]>(contact?.phones ?? []);
    const [address, setAddress] = useState<ContactPostalAddress | null>(contact?.addresses[0] ?? null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    function updateEmail(index: number, patch: Partial<ContactEmail>) {
        setEmails((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    }
    function removeEmail(index: number) {
        setEmails((prev) => prev.filter((_, i) => i !== index));
    }
    function updatePhone(index: number, patch: Partial<ContactPhone>) {
        setPhones((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    }
    function removePhone(index: number) {
        setPhones((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (!displayName.trim()) {
            setError("A display name is required.");
            return;
        }

        setSaving(true);
        try {
            const categories = categoriesText
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean);
            const input = {
                displayName: displayName.trim(),
                givenName: givenName.trim() || undefined,
                surname: surname.trim() || undefined,
                company: company.trim() || undefined,
                jobTitle: jobTitle.trim() || undefined,
                notes: notes.trim() || undefined,
                favorite,
                categories,
                emails,
                phones,
                addresses: address ? [address] : [],
            };
            const saved = contact
                ? await updateContact({ uid: contact.uid, version: contact.version, mailboxUid: contact.mailboxUid, folderUid: contact.folderUid, ...input })
                : await createContact({ mailboxUid: mailboxUid as string, folderUid: folderUid as string, ...input });
            onSaved(saved);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save this contact.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="max-w-xl flex flex-col gap-1">
            <h1 className="text-xl font-bold uppercase tracking-wide mb-3">{contact ? "Edit contact" : "New contact"}</h1>

            {error && <Alert>{error}</Alert>}

            <FormField label="Display name" htmlFor="contact-displayName">
                <input
                    id="contact-displayName"
                    type="text"
                    className={INPUT_CLASS}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
                <FormField label="First name" htmlFor="contact-givenName">
                    <input id="contact-givenName" type="text" className={INPUT_CLASS} value={givenName} onChange={(e) => setGivenName(e.target.value)} />
                </FormField>
                <FormField label="Last name" htmlFor="contact-surname">
                    <input id="contact-surname" type="text" className={INPUT_CLASS} value={surname} onChange={(e) => setSurname(e.target.value)} />
                </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <FormField label="Company" htmlFor="contact-company">
                    <input id="contact-company" type="text" className={INPUT_CLASS} value={company} onChange={(e) => setCompany(e.target.value)} />
                </FormField>
                <FormField label="Job title" htmlFor="contact-jobTitle">
                    <input id="contact-jobTitle" type="text" className={INPUT_CLASS} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </FormField>
            </div>

            <label className="flex items-center gap-2 text-sm mb-4">
                <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
                Favorite
            </label>

            <FormField label="Categories (comma-separated)" htmlFor="contact-categories">
                <input
                    id="contact-categories"
                    type="text"
                    className={INPUT_CLASS}
                    value={categoriesText}
                    onChange={(e) => setCategoriesText(e.target.value)}
                    placeholder="VIP, Work"
                />
            </FormField>

            <FormField label="Email" htmlFor="contact-emails">
                <div id="contact-emails" className="flex flex-col gap-2">
                    {emails.map((email, i) => (
                        <div key={i} className="flex gap-2">
                            <input
                                type="email"
                                className={`${INPUT_CLASS} flex-1`}
                                value={email.address}
                                onChange={(e) => updateEmail(i, { address: e.target.value })}
                                aria-label={`Email address ${i + 1}`}
                            />
                            <select
                                className={SELECT_CLASS}
                                value={email.type}
                                onChange={(e) => updateEmail(i, { type: e.target.value as ContactAddressKind })}
                                aria-label={`Email type ${i + 1}`}
                            >
                                {ADDRESS_KINDS.map((kind) => (
                                    <option key={kind} value={kind}>
                                        {kind}
                                    </option>
                                ))}
                            </select>
                            <button type="button" onClick={() => removeEmail(i)} className="text-sm text-danger px-2" aria-label={`Remove email ${i + 1}`}>
                                &times;
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setEmails((prev) => [...prev, { address: "", type: "work" }])}
                        className="self-start text-xs font-medium text-primary-dark hover:underline"
                    >
                        + Add email
                    </button>
                </div>
            </FormField>

            <FormField label="Phone" htmlFor="contact-phones">
                <div id="contact-phones" className="flex flex-col gap-2">
                    {phones.map((phone, i) => (
                        <div key={i} className="flex gap-2">
                            <input
                                type="tel"
                                className={`${INPUT_CLASS} flex-1`}
                                value={phone.phoneNumber}
                                onChange={(e) => updatePhone(i, { phoneNumber: e.target.value })}
                                aria-label={`Phone number ${i + 1}`}
                            />
                            <select
                                className={SELECT_CLASS}
                                value={phone.type}
                                onChange={(e) => updatePhone(i, { type: e.target.value as ContactAddressKind })}
                                aria-label={`Phone type ${i + 1}`}
                            >
                                {ADDRESS_KINDS.map((kind) => (
                                    <option key={kind} value={kind}>
                                        {kind}
                                    </option>
                                ))}
                            </select>
                            <button type="button" onClick={() => removePhone(i)} className="text-sm text-danger px-2" aria-label={`Remove phone ${i + 1}`}>
                                &times;
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setPhones((prev) => [...prev, { phoneNumber: "", type: "work" }])}
                        className="self-start text-xs font-medium text-primary-dark hover:underline"
                    >
                        + Add phone
                    </button>
                </div>
            </FormField>

            <FormField label="Address" htmlFor="contact-address">
                {address ? (
                    <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="text"
                                placeholder="Street"
                                className={INPUT_CLASS}
                                value={address.street ?? ""}
                                onChange={(e) => setAddress({ ...address, street: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="City"
                                className={INPUT_CLASS}
                                value={address.city ?? ""}
                                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="State/Province"
                                className={INPUT_CLASS}
                                value={address.state ?? ""}
                                onChange={(e) => setAddress({ ...address, state: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="Postal code"
                                className={INPUT_CLASS}
                                value={address.postalCode ?? ""}
                                onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="Country"
                                className={INPUT_CLASS}
                                value={address.country ?? ""}
                                onChange={(e) => setAddress({ ...address, country: e.target.value })}
                            />
                            <select
                                className={SELECT_CLASS}
                                value={address.type}
                                onChange={(e) => setAddress({ ...address, type: e.target.value as ContactAddressKind })}
                                aria-label="Address type"
                            >
                                {ADDRESS_KINDS.map((kind) => (
                                    <option key={kind} value={kind}>
                                        {kind}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button type="button" onClick={() => setAddress(null)} className="self-start text-xs font-medium text-danger hover:underline">
                            Remove address
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAddress({ type: "home" })}
                        className="self-start text-xs font-medium text-primary-dark hover:underline"
                    >
                        + Add address
                    </button>
                )}
            </FormField>

            <FormField label="Notes" htmlFor="contact-notes">
                <textarea id="contact-notes" rows={3} className={INPUT_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>

            <div className="flex gap-3 mt-2">
                <Button type="submit" loading={saving} disabled={saving} className="!w-auto">
                    Save
                </Button>
                <Button type="button" variant="secondary" className="!w-auto" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}
