// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "./testUtils.js";
import InboxPage from "../../apps/www/index.js";

const mailbox = {
    uid: "mb1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    ownerUserUid: "u1",
    primarySmtpAddress: "u1@example.com",
    aliasAddresses: [],
    displayName: "My Mail",
    timezone: "UTC",
    quotaBytes: 1_000_000_000,
    usedBytes: 0,
};
const inboxFolder = {
    uid: "f1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    name: "Inbox",
    type: "inbox" as const,
    unreadCount: 0,
    totalCount: 2,
};

function messageFixture(overrides: Record<string, unknown> = {}) {
    return {
        uid: "m1",
        version: 0,
        dateCreated: "2026-01-01T00:00:00.000Z",
        dateModified: "2026-01-01T00:00:00.000Z",
        folderUid: "f1",
        mailboxUid: "mb1",
        messageId: "abc@example.com",
        subject: "Hello there",
        from: { address: "sender@example.com", displayName: "Sender One", type: "to" as const },
        recipients: [{ address: "u1@example.com", displayName: "Me", type: "to" as const }],
        sentDate: "2026-01-01T00:00:00.000Z",
        receivedDate: "2026-01-01T00:00:00.000Z",
        bodyPreview: "Hi there, just checking in.",
        flags: { read: false, flagged: false, answered: false, forwarded: false },
        importance: "normal" as const,
        hasAttachments: false,
        ...overrides,
    };
}

function mockShellAndInbox(messages: unknown[], extra?: (url: string, init?: RequestInit) => Response | undefined) {
    return mockFetch((url, init) => {
        const custom = extra?.(url, init);
        if (custom) return custom;
        if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
        if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [inboxFolder]);
        if (url.startsWith("/api/mail/messages/")) {
            const method = init?.method ?? "GET";
            if (method === "PUT") {
                const uid = url.split("/api/mail/messages/")[1];
                const body = JSON.parse(init.body as string);
                const existing = messages.find((m: any) => m.uid === uid) as any;
                return jsonResponse(200, { ...existing, flags: { ...existing.flags, ...body.flags } });
            }
        }
        if (url.startsWith("/api/mail/messages")) return jsonResponse(200, messages);
        if (url.startsWith("/api/mail/attachments")) return jsonResponse(200, []);
        throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("InboxPage", () => {
    it("shows a message when no mailbox is available yet", async () => {
        mockFetch((url) => {
            // Checked before the general "/api/mail/mailboxes" prefix below, which would otherwise also
            // match this sub-path and hand `MailboxProvisioning` the mailbox list as if it were its own
            // response shape. 404 matches this feature's real default (disabled unless configured).
            if (url.startsWith("/api/mail/mailboxes/auto-provision")) return jsonResponse(404, { message: "not enabled" });
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, []);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, []);
            throw new Error(`unexpected ${url}`);
        });
        render(<InboxPage userUid="u1" />);
        expect(await screen.findByText("No mailbox available")).toBeInTheDocument();
        expect(screen.getByText("Ask an administrator to create one for you.")).toBeInTheDocument();
        expect(screen.queryByRole("navigation", { name: "Apps" })).not.toBeInTheDocument();
    });

    it("shows a loading indicator while messages are being fetched", async () => {
        let resolveMessages: ((value: unknown[]) => void) | undefined;
        mockFetch((url) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [inboxFolder]);
            if (url.startsWith("/api/mail/messages")) {
                return new Promise((resolve) => {
                    resolveMessages = (value) => resolve(jsonResponse(200, value));
                });
            }
            throw new Error(`unexpected ${url}`);
        });
        render(<InboxPage userUid="u1" />);
        expect(await screen.findByText("Loading…")).toBeInTheDocument();
        resolveMessages!([]);
        expect(await screen.findByText("No messages in this folder.")).toBeInTheDocument();
    });

    it("shows an empty-state message when the folder has no messages", async () => {
        mockShellAndInbox([]);
        render(<InboxPage userUid="u1" />);
        expect(await screen.findByText("No messages in this folder.")).toBeInTheDocument();
    });

    it("shows an error message when loading messages fails", async () => {
        mockShellAndInbox([], (url) => (url.startsWith("/api/mail/messages") ? jsonResponse(500, { message: "boom" }) : undefined));
        render(<InboxPage userUid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when loading messages fails with a non-API error", async () => {
        mockShellAndInbox([], (url) => {
            if (url.startsWith("/api/mail/messages")) throw new TypeError("network down");
            return undefined;
        });
        render(<InboxPage userUid="u1" />);
        expect(await screen.findByText("Could not load messages.")).toBeInTheDocument();
    });

    it("lists messages and shows a placeholder until one is selected", async () => {
        mockShellAndInbox([messageFixture()]);
        render(<InboxPage userUid="u1" />);
        expect(await screen.findByText("Hello there")).toBeInTheDocument();
        expect(screen.getByText("Select a message to read it.")).toBeInTheDocument();
    });

    it("selects a message, marks it read, and shows its reading pane", async () => {
        const msg = messageFixture();
        const fetchMock = mockShellAndInbox([msg]);
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        await user.click(await screen.findByText("Hello there"));

        expect(await screen.findByRole("heading", { name: "Hello there" })).toBeInTheDocument();
        expect(screen.getByTitle("Hello there")).toHaveAttribute("src", "/api/mail/messages/m1/content");
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/mail/messages/m1",
                expect.objectContaining({ method: "PUT" }),
            ),
        );
    });

    it("does not re-mark an already-read message as read", async () => {
        const msg = messageFixture({ flags: { read: true, flagged: false, answered: false, forwarded: false } });
        const fetchMock = mockShellAndInbox([msg]);
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        await user.click(await screen.findByText("Hello there"));
        await screen.findByRole("heading", { name: "Hello there" });

        expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit)?.method === "PUT")).toBe(false);
    });

    it("swallows a failed mark-as-read update rather than blocking the reading pane", async () => {
        const msg = messageFixture();
        mockShellAndInbox([msg], (url, init) => {
            if (url === "/api/mail/messages/m1" && (init?.method ?? "GET") === "PUT") {
                return jsonResponse(500, { message: "boom" });
            }
            return undefined;
        });
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        await user.click(await screen.findByText("Hello there"));

        expect(await screen.findByRole("heading", { name: "Hello there" })).toBeInTheDocument();
    });

    it("lists and links to attachments for a message that has them", async () => {
        const msg = messageFixture({ hasAttachments: true });
        const attachment = {
            uid: "a1",
            version: 0,
            dateCreated: "2026-01-01T00:00:00.000Z",
            dateModified: "2026-01-01T00:00:00.000Z",
            messageUid: "m1",
            folderUid: "f1",
            mailboxUid: "mb1",
            filename: "report.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2_500_000,
            isInline: false,
        };
        mockShellAndInbox([msg], (url) => (url.startsWith("/api/mail/attachments") ? jsonResponse(200, [attachment]) : undefined));
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        await user.click(await screen.findByText("Hello there"));

        const link = await screen.findByRole("link", { name: /report\.pdf/ });
        expect(link).toHaveAttribute("href", "/api/mail/attachments/a1/content");
        expect(link.textContent).toContain("2.5 MB");
    });

    it("silently shows no attachments when the attachment list fails to load", async () => {
        const msg = messageFixture({ hasAttachments: true });
        mockShellAndInbox([msg], (url) =>
            url.startsWith("/api/mail/attachments") ? jsonResponse(500, { message: "boom" }) : undefined,
        );
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        await user.click(await screen.findByText("Hello there"));

        expect(await screen.findByRole("heading", { name: "Hello there" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /pdf|txt/ })).not.toBeInTheDocument();
    });

    it("falls back to the raw address and '(no subject)' when displayName/subject are absent", async () => {
        const msg = messageFixture({
            subject: "",
            from: { address: "sender@example.com", type: "to" as const },
            recipients: [{ address: "u1@example.com", type: "to" as const }],
        });
        mockShellAndInbox([msg]);
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        expect(await screen.findByText("sender@example.com")).toBeInTheDocument();
        expect(screen.getAllByText("(no subject)")[0]).toBeInTheDocument();

        await user.click(screen.getByText("sender@example.com"));

        expect(await screen.findByRole("heading", { name: "(no subject)" })).toBeInTheDocument();
        expect(screen.getByText(/From sender@example\.com/)).toBeInTheDocument();
        expect(screen.getByText("To u1@example.com")).toBeInTheDocument();
        expect(screen.getByTitle("Message content")).toBeInTheDocument();
    });

    it("formats attachment sizes across byte/KB/MB tiers", async () => {
        const msg = messageFixture({ hasAttachments: true });
        const attachments = [
            { uid: "a1", version: 0, dateCreated: "", dateModified: "", messageUid: "m1", folderUid: "f1", mailboxUid: "mb1", filename: "tiny.txt", mimeType: "text/plain", sizeBytes: 500, isInline: false },
            { uid: "a2", version: 0, dateCreated: "", dateModified: "", messageUid: "m1", folderUid: "f1", mailboxUid: "mb1", filename: "medium.txt", mimeType: "text/plain", sizeBytes: 2_500, isInline: false },
            { uid: "a3", version: 0, dateCreated: "", dateModified: "", messageUid: "m1", folderUid: "f1", mailboxUid: "mb1", filename: "big.pdf", mimeType: "application/pdf", sizeBytes: 2_500_000, isInline: false },
        ];
        mockShellAndInbox([msg], (url) => (url.startsWith("/api/mail/attachments") ? jsonResponse(200, attachments) : undefined));
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        await user.click(await screen.findByText("Hello there"));

        expect(await screen.findByText(/tiny\.txt \(500 B\)/)).toBeInTheDocument();
        expect(screen.getByText(/medium\.txt \(2\.5 KB\)/)).toBeInTheDocument();
        expect(screen.getByText(/big\.pdf \(2\.5 MB\)/)).toBeInTheDocument();
    });

    it("clears the attachment list when a message without attachments is reselected", async () => {
        const withAttachment = messageFixture({ uid: "m1", hasAttachments: true, subject: "Has attachment" });
        const withoutAttachment = messageFixture({ uid: "m2", subject: "No attachment" });
        const attachment = {
            uid: "a1",
            version: 0,
            dateCreated: "2026-01-01T00:00:00.000Z",
            dateModified: "2026-01-01T00:00:00.000Z",
            messageUid: "m1",
            folderUid: "f1",
            mailboxUid: "mb1",
            filename: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 500,
            isInline: false,
        };
        mockShellAndInbox(
            [withAttachment, withoutAttachment],
            (url) => (url.startsWith("/api/mail/attachments") ? jsonResponse(200, [attachment]) : undefined),
        );
        const user = userEvent.setup();
        render(<InboxPage userUid="u1" />);

        await user.click(await screen.findByText("Has attachment"));
        await screen.findByRole("link", { name: /notes\.txt/ });

        await user.click(await screen.findByText("No attachment"));
        await screen.findByRole("heading", { name: "No attachment" });
        expect(screen.queryByRole("link", { name: /notes\.txt/ })).not.toBeInTheDocument();
    });
});
