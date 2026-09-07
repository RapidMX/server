///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s REST surface. Shared by `apps/admin` and (from Phase 3 on)
 * `apps/www` — there is no separate admin-only endpoint set to isolate: every route here is gated entirely
 * by the ACL system, so the exact same call returns a caller's own data or (for a trusted/admin caller)
 * everyone's, depending on who's asking. See `BaseMailboxRoute`'s doc comment in `@rapidmx/restapi` and this
 * repo's `.claude/NOTES.md`.
 */

import { ApiRequestError, apiFetch, authApiFetch } from "./api.js";

export interface Mailbox {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    /** Absent for a true ownerless shared mailbox (e.g. `support@example.com`) — access is ACL-only. */
    ownerUserUid?: string;
    primarySmtpAddress: string;
    aliasAddresses: string[];
    displayName: string;
    timezone: string;
    quotaBytes: number;
    usedBytes: number;
}

export interface ListParams {
    page?: number;
    limit?: number;
}

const DEFAULT_PAGE_SIZE = 25;

function buildQuery(params: ListParams, extra: Record<string, string> = {}): string {
    const parts: string[] = [`limit=${params.limit ?? DEFAULT_PAGE_SIZE}`, `page=${params.page ?? 0}`];
    for (const [key, value] of Object.entries(extra)) {
        parts.push(`${key}=${encodeURIComponent(value)}`);
    }
    return parts.join("&");
}

/** Lists mailboxes the caller can access (owned, shared with them, or — for a trusted caller — every one). */
export function listMailboxes(params: ListParams = {}): Promise<Mailbox[]> {
    return apiFetch(`/mail/mailboxes?${buildQuery(params)}`);
}

export function getMailbox(uid: string): Promise<Mailbox> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(uid)}`);
}

export interface CreateMailboxInput {
    /** Omit entirely to create a true ownerless shared mailbox — trusted-role-only (see BaseMailboxRoute). */
    ownerUserUid?: string;
    primarySmtpAddress: string;
    aliasAddresses?: string[];
    displayName: string;
    timezone: string;
    quotaBytes: number;
}

export function createMailbox(input: CreateMailboxInput): Promise<Mailbox> {
    return apiFetch("/mail/mailboxes", {
        method: "POST",
        body: JSON.stringify({ aliasAddresses: [], usedBytes: 0, ...input }),
    });
}

export interface UpdateMailboxInput {
    uid: string;
    version: number;
    displayName?: string;
    timezone?: string;
    quotaBytes?: number;
    aliasAddresses?: string[];
}

export function updateMailbox(input: UpdateMailboxInput): Promise<Mailbox> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteMailbox(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}

export type QuarantineReason = "infected" | "spam_policy" | "other";

export interface QuarantineEntry {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    originalMessageUid?: string;
    reason: QuarantineReason;
    scanResultUid: string;
    rawBlobKey: string;
    releasedAt?: string;
    releasedByUserUid?: string;
}

/** Lists quarantined mail for a mailbox the caller can access — their own, or (trusted) any mailbox. */
export function listQuarantine(mailboxUid: string, params: ListParams = {}): Promise<QuarantineEntry[]> {
    return apiFetch(`/mail/quarantine?${buildQuery(params, { mailboxUid })}`);
}

/**
 * Marks a quarantined entry released. This only updates the record's metadata — it does not re-inject the
 * message into normal delivery (see `@rapidmx/restapi`'s NOTES.md for why that's an explicit non-goal here).
 */
export function releaseQuarantineEntry(uid: string, version: number, releasedByUserUid: string): Promise<QuarantineEntry> {
    return apiFetch(`/mail/quarantine/${encodeURIComponent(uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid, version, releasedAt: new Date().toISOString(), releasedByUserUid }),
    });
}

export type IngestStatus = "pending" | "scanning" | "delivered" | "failed";

export interface IngestQueueEntry {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    envelopeFrom: string;
    envelopeTo: string[];
    rawBlobKey: string;
    status: IngestStatus;
    errorMessage?: string;
}

/** Lists ingest-queue entries for a mailbox the caller can access — useful for diagnosing stuck delivery. */
export function listIngestQueue(mailboxUid: string, params: ListParams = {}): Promise<IngestQueueEntry[]> {
    return apiFetch(`/mail/ingest-queue?${buildQuery(params, { mailboxUid })}`);
}

export interface AclRecord {
    userOrRoleId: string;
    actions: string[];
}

export interface AccessControlList {
    uid: string;
    version: number;
    parentUid?: string;
    records: AclRecord[];
}

/** Fetches a mailbox's own ACL — its `records` are its owner's/delegates' grants (see BaseACLRoute). */
export function getMailboxAcl(mailboxUid: string): Promise<AccessControlList> {
    return apiFetch(`/acls/${encodeURIComponent(mailboxUid)}`);
}

/**
 * Grants (or replaces, if `userOrRoleId` already has a record) a delegate's access to a mailbox — the
 * mechanism behind Exchange-style shared mailboxes. Read-modify-write against the ACL's own optimistic
 * `version`, so concurrent grants can conflict; the caller should retry on a 409/version-mismatch.
 */
export async function grantMailboxAccess(mailboxUid: string, userOrRoleId: string, actions: string[]): Promise<AccessControlList> {
    const acl = await getMailboxAcl(mailboxUid);
    const records = acl.records.filter((r) => r.userOrRoleId !== userOrRoleId);
    records.push({ userOrRoleId, actions });
    return apiFetch(`/acls/${encodeURIComponent(mailboxUid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: mailboxUid, version: acl.version, records }),
    });
}

/** Revokes a delegate's access to a mailbox previously granted via `grantMailboxAccess`. */
export async function revokeMailboxAccess(mailboxUid: string, userOrRoleId: string): Promise<AccessControlList> {
    const acl = await getMailboxAcl(mailboxUid);
    const records = acl.records.filter((r) => r.userOrRoleId !== userOrRoleId);
    return apiFetch(`/acls/${encodeURIComponent(mailboxUid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: mailboxUid, version: acl.version, records }),
    });
}

export type FolderType =
    | "inbox"
    | "sent_items"
    | "drafts"
    | "deleted_items"
    | "outbox"
    | "junk"
    | "calendar"
    | "contacts"
    | "tasks"
    | "notes"
    | "user";

export interface Folder {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    name: string;
    type: FolderType;
    parentFolderUid?: string;
    unreadCount: number;
    totalCount: number;
}

/** Lists a mailbox's folders — visible to its owner, any delegate the mailbox is shared with, or (trusted) anyone. */
export function listFolders(mailboxUid: string): Promise<Folder[]> {
    return apiFetch(`/mail/folders?${buildQuery({ limit: 200 }, { mailboxUid })}`);
}

export type RecipientType = "to" | "cc" | "bcc";

export interface Recipient {
    address: string;
    displayName?: string;
    type: RecipientType;
}

export interface MessageFlags {
    read: boolean;
    flagged: boolean;
    answered: boolean;
    forwarded: boolean;
}

export type MessageImportance = "low" | "normal" | "high";

export interface Message {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    folderUid: string;
    mailboxUid: string;
    messageId: string;
    subject: string;
    from: Recipient;
    recipients: Recipient[];
    sentDate: string;
    receivedDate: string;
    bodyPreview: string;
    flags: MessageFlags;
    importance: MessageImportance;
    hasAttachments: boolean;
}

/** Lists messages in a folder, newest first. */
export function listMessages(folderUid: string, params: ListParams = {}): Promise<Message[]> {
    return apiFetch(
        `/mail/messages?${buildQuery(params, { folderUid, sort: JSON.stringify({ receivedDate: "DESC" }) })}`,
    );
}

export function getMessage(uid: string): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(uid)}`);
}

/**
 * Marks a message read/unread in place. `folderUid` must be included even though it isn't changing — every
 * `Message` update is scoped by its owning folder (see `BaseScopedChildRoute`), and this framework's `PUT`
 * routes replace the whole record rather than patch individual fields.
 */
export function setMessageRead(message: Message, read: boolean): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(message.uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: message.uid, version: message.version, flags: { ...message.flags, read } }),
    });
}

export interface Attachment {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    messageUid: string;
    folderUid: string;
    mailboxUid: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    isInline: boolean;
}

/** Lists the attachments belonging to a single message. */
export function listAttachments(folderUid: string, messageUid: string): Promise<Attachment[]> {
    return apiFetch(`/mail/attachments?${buildQuery({ limit: 200 }, { folderUid, messageUid })}`);
}

/** The same-origin URL to download/display an attachment's binary content — not fetched via `apiFetch`, used directly as a link/image `href`/`src`. */
export function attachmentContentUrl(uid: string): string {
    return `/api/mail/attachments/${encodeURIComponent(uid)}/content`;
}

/**
 * Uploads a file's raw bytes as a new attachment on a not-yet-sent draft. Bypasses `apiFetch` — that helper
 * always forces `Content-Type: application/json`, which would corrupt binary content; this sends the file's
 * own bytes/type directly instead, matching `BaseAttachmentRoute.upload`'s expectation of a raw request body.
 */
export async function uploadAttachment(messageUid: string, file: File): Promise<Attachment> {
    const params = new URLSearchParams({ messageUid, filename: file.name, mimeType: file.type || "application/octet-stream" });
    const res = await fetch(`/api/mail/attachments/upload?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;
    if (!res.ok) {
        const message = (responseBody && (responseBody.message || responseBody.error)) || res.statusText || "Upload failed.";
        throw new ApiRequestError(message, res.status, responseBody?.code);
    }
    return responseBody as Attachment;
}

export interface ComposeRecipientInput {
    address: string;
    displayName?: string;
}

export interface AssembleDraftInput {
    to: ComposeRecipientInput[];
    cc?: ComposeRecipientInput[];
    bcc?: ComposeRecipientInput[];
    subject?: string;
    html: string;
}

/** Creates a blank draft `Message` in the given folder (normally the mailbox's Drafts folder) to compose into. */
export function createDraft(mailboxUid: string, folderUid: string): Promise<Message> {
    return apiFetch("/mail/messages", {
        method: "POST",
        body: JSON.stringify({ mailboxUid, folderUid, messageId: `${crypto.randomUUID()}@webmail` }),
    });
}

/**
 * Assembles a draft's structured compose input (recipients/subject/HTML body, plus whatever attachments have
 * already been `uploadAttachment()`-ed onto it) into RFC 5322 MIME and stores it as the draft's `bodyBlobKey`
 * — see `BaseMailComposeRoute` (this app's own compose-assembly glue, since `@rapidmx/restapi`'s `send()`
 * itself does no MIME composition). Does not send the message.
 */
export function assembleDraft(messageUid: string, input: AssembleDraftInput): Promise<Message> {
    return apiFetch(`/mail/compose/${encodeURIComponent(messageUid)}/assemble`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/** Scans, relays, and moves an already-assembled draft into Sent Items. */
export function sendMessage(messageUid: string): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(messageUid)}/send`, { method: "POST" });
}

export interface ImpersonationResult {
    token: string;
    user: { uid: string; roles: string[]; scopes: string[] };
}

/**
 * Trusted-role-only: starts an admin "log in as user" session. In production this calls auth-server
 * directly (not this app's own API) since only auth-server can mint a token carrying `userUid`'s real
 * roles/scopes the way its own sign-in flow would — see `@rapidrest/auth`'s `BaseImpersonationRoute` and
 * this repo's `.claude/NOTES.md`. The browser's `jwt` cookie is swapped for the freshly-minted token, and
 * the caller's own session is stashed (`jwt_impersonator`) so `stopImpersonating()` can restore it later.
 * The caller is responsible for navigating to `/` afterward — this call only swaps the cookie, it doesn't
 * redirect.
 *
 * @param impersonationBaseUrl The origin to call — the real auth-server in production, or `""` under
 * `yarn dev` (see `AdminConsoleRoute`/`wwwRoute`'s `fetchProps`) to instead call this app's own local
 * dev-only endpoint (`DevImpersonationRoute`), since a real auth-server isn't running locally.
 */
export function impersonateUser(impersonationBaseUrl: string, userUid: string): Promise<ImpersonationResult> {
    const init: RequestInit = { method: "POST", body: JSON.stringify({ userUid }) };
    return impersonationBaseUrl
        ? authApiFetch(impersonationBaseUrl, "/admin/impersonate", init)
        : apiFetch("/admin/impersonate", init);
}

/** Ends an active impersonation session, restoring the admin's own — a no-op (`restored: false`) if none is active. */
export function stopImpersonating(impersonationBaseUrl: string): Promise<{ restored: boolean }> {
    return impersonationBaseUrl
        ? authApiFetch(impersonationBaseUrl, "/admin/impersonate/stop", { method: "GET" })
        : apiFetch("/admin/impersonate/stop", { method: "GET" });
}
