///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/** Typed wrappers over `@rapidmx/restapi`'s `/mail/contacts` REST surface — see `mailApi.ts`'s own header
 * comment for the shared ACL/authorization model every wrapper file here follows. */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type ContactAddressKind = "home" | "work" | "other";

export interface ContactEmail {
    address: string;
    type: ContactAddressKind;
}

export interface ContactPhone {
    phoneNumber: string;
    type: ContactAddressKind;
}

export interface ContactPostalAddress {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    type: ContactAddressKind;
}

export interface Contact {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    folderUid: string;
    /** The `ContactList` (group) this contact belongs to, if any — not used in this pass (flat list only). */
    contactListUid?: string;
    displayName: string;
    givenName?: string;
    surname?: string;
    emails: ContactEmail[];
    phones: ContactPhone[];
    addresses: ContactPostalAddress[];
    company?: string;
    jobTitle?: string;
    notes?: string;
    photoBlobKey?: string;
    sourceUid?: string;
}

/** Lists a folder's contacts, alphabetically by display name. */
export function listContacts(folderUid: string, params: ListParams = {}): Promise<Contact[]> {
    return apiFetch(`/mail/contacts?${buildQuery(params, { folderUid, sort: JSON.stringify({ displayName: "ASC" }) })}`);
}

export function getContact(uid: string): Promise<Contact> {
    return apiFetch(`/mail/contacts/${encodeURIComponent(uid)}`);
}

export interface ContactInput {
    mailboxUid: string;
    folderUid: string;
    displayName: string;
    givenName?: string;
    surname?: string;
    emails?: ContactEmail[];
    phones?: ContactPhone[];
    addresses?: ContactPostalAddress[];
    company?: string;
    jobTitle?: string;
    notes?: string;
}

export function createContact(input: ContactInput): Promise<Contact> {
    return apiFetch("/mail/contacts", {
        method: "POST",
        body: JSON.stringify({ emails: [], phones: [], addresses: [], ...input }),
    });
}

export interface UpdateContactInput extends ContactInput {
    uid: string;
    version: number;
}

export function updateContact(input: UpdateContactInput): Promise<Contact> {
    return apiFetch(`/mail/contacts/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteContact(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/contacts/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
