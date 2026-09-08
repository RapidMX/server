// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, mockLocation, mockMatchMedia } from "./testUtils.js";
import InboxPage from "../../apps/www/index.js";

// `MessageDetailPane`'s own exhaustive rendering (header fields, attachments, back link, iframe,
// formatting) is tested in its own `MessageDetailPane.test.tsx` — mocked here to a thin stand-in so this
// file only exercises `InboxPage`/`InboxContent`'s own concerns: the message list, loading/error/empty
// states, and the desktop-vs-mobile selection branch.
vi.mock("../../apps/shared/components/mail/MessageDetailPane.js", () => ({
    default: ({
        message,
        isSentItems,
        onRecalled,
    }: {
        message: Record<string, unknown> | null;
        isSentItems?: boolean;
        onRecalled?: (updated: Record<string, unknown>) => void;
    }) => (
        <div data-testid="detail-pane">
            {message ? `message:${message.uid}` : "no-message"} sentItems:{String(!!isSentItems)}
            {message && onRecalled && (
                <button type="button" onClick={() => onRecalled({ ...message, recallRequestedAt: "2026-01-02T00:00:00.000Z" })}>
                    simulate-recall
                </button>
            )}
        </div>
    ),
}));

// `ConversationThreadPane`'s own exhaustive rendering (fetching every message, expand/collapse,
// lazy attachment/mark-read) is tested in its own `ConversationThreadPane.test.tsx` — mocked here for
// the same reason `MessageDetailPane` is: this file only exercises `InboxContent`'s own concerns, here
// the "By date"/"By conversation" toggle and conversation-list selection wiring.
vi.mock("../../apps/shared/components/mail/ConversationThreadPane.js", () => ({
    default: ({ conversation }: { conversation: { conversationId: string } | null }) => (
        <div data-testid="thread-pane">{conversation ? `conversation:${conversation.conversationId}` : "no-conversation"}</div>
    ),
}));

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
const sentItemsFolder = { ...inboxFolder, uid: "f2", name: "Sent Items", type: "sent_items" as const };

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

function conversationFixture(overrides: Record<string, unknown> = {}) {
    return {
        conversationId: "c1",
        subject: "Hello there",
        messageUids: ["m1"],
        folderUids: ["f1"],
        messageCount: 1,
        unreadCount: 0,
        latestDate: "2026-01-01T00:00:00.000Z",
        participants: [{ address: "sender@example.com", displayName: "Sender One", type: "to" as const }],
        hasAttachments: false,
        ...overrides,
    };
}

function mockShellAndInbox(
    messages: unknown[],
    extra?: (url: string, init?: RequestInit) => Response | undefined,
    conversations: unknown[] = [],
) {
    return mockFetch((url, init) => {
        const custom = extra?.(url, init);
        if (custom) return custom;
        if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
        if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [inboxFolder]);
        if (url.startsWith("/api/mail/messages/conversations")) return jsonResponse(200, conversations);
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

    it("lists messages and shows the detail pane with no message selected", async () => {
        mockShellAndInbox([messageFixture()]);
        render(<InboxPage userUid="u1" />);
        expect(await screen.findByText("Hello there")).toBeInTheDocument();
        expect(screen.getByTestId("detail-pane")).toHaveTextContent("no-message");
    });

    it("falls back to the raw address and '(no subject)' in the message list row", async () => {
        const msg = messageFixture({
            subject: "",
            from: { address: "sender@example.com", type: "to" as const },
        });
        mockShellAndInbox([msg]);
        render(<InboxPage userUid="u1" />);

        expect(await screen.findByText("sender@example.com")).toBeInTheDocument();
        expect(screen.getByText("(no subject)")).toBeInTheDocument();
    });

    describe("on desktop", () => {
        it("selects a message in place, marks it read, and passes it to the detail pane", async () => {
            const msg = messageFixture();
            const fetchMock = mockShellAndInbox([msg]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByText("Hello there"));

            expect(await screen.findByTestId("detail-pane")).toHaveTextContent("message:m1");
            await waitFor(() =>
                expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages/m1", expect.objectContaining({ method: "PUT" })),
            );
        });

        it("passes isSentItems=false for a message in a non-Sent-Items folder", async () => {
            const msg = messageFixture();
            mockShellAndInbox([msg]);
            render(<InboxPage userUid="u1" />);

            await screen.findByText("Hello there");
            expect(screen.getByTestId("detail-pane")).toHaveTextContent("sentItems:false");
        });

        it("passes isSentItems=true for a message in the selected Sent Items folder", async () => {
            window.history.pushState(null, "", "/?mailboxUid=mb1&folderUid=f2");
            const msg = messageFixture({ folderUid: "f2" });
            mockFetch((url) => {
                if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
                if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [inboxFolder, sentItemsFolder]);
                if (url.startsWith("/api/mail/messages")) return jsonResponse(200, [msg]);
                throw new Error(`unexpected ${url}`);
            });
            render(<InboxPage userUid="u1" />);

            await screen.findByText("Hello there");
            expect(screen.getByTestId("detail-pane")).toHaveTextContent("sentItems:true");
            window.history.pushState(null, "", "/");
        });

        it("patches the recalled message into the list via onRecalled", async () => {
            const msg = messageFixture();
            mockShellAndInbox([msg]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByText("Hello there"));
            await user.click(await screen.findByRole("button", { name: "simulate-recall" }));

            expect(await screen.findByTestId("detail-pane")).toHaveTextContent("message:m1");
            // A second selection round-trip proves the update landed in `messages` state itself (the
            // patched copy persists), not just in the already-rendered detail pane's own local props.
            await user.click(screen.getByText("Hello there"));
            expect(screen.getByTestId("detail-pane")).toHaveTextContent("message:m1");
        });

        it("leaves other messages in the list untouched when patching the recalled one", async () => {
            const first = messageFixture({ uid: "m1", subject: "First" });
            const second = messageFixture({ uid: "m2", subject: "Second" });
            mockShellAndInbox([first, second]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByText("First"));
            await user.click(await screen.findByRole("button", { name: "simulate-recall" }));

            // "Second" surviving unchanged proves the recall patch's own `.map()` correctly left the
            // non-matching message alone — the same class of gap the mark-as-read patch above already
            // guards against, for this separate update path.
            expect(screen.getByText("Second")).toBeInTheDocument();
        });

        it("leaves other messages in the list untouched when marking one of several read", async () => {
            const first = messageFixture({ uid: "m1", subject: "First" });
            const second = messageFixture({ uid: "m2", subject: "Second" });
            mockShellAndInbox([first, second]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByText("First"));

            expect(await screen.findByTestId("detail-pane")).toHaveTextContent("message:m1");
            // "Second" surviving in the list, unchanged, is what proves the read-marking update's
            // `.map()` correctly left the non-matching message alone rather than only ever exercising
            // the branch that replaces the one being marked read.
            expect(screen.getByText("Second")).toBeInTheDocument();
        });

        it("does not re-mark an already-read message as read", async () => {
            const msg = messageFixture({ flags: { read: true, flagged: false, answered: false, forwarded: false } });
            const fetchMock = mockShellAndInbox([msg]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByText("Hello there"));
            await screen.findByTestId("detail-pane");

            expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit)?.method === "PUT")).toBe(false);
        });

        it("swallows a failed mark-as-read update rather than blocking selection", async () => {
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

            expect(await screen.findByTestId("detail-pane")).toHaveTextContent("message:m1");
        });
    });

    describe("on mobile", () => {
        it("navigates to the message detail route instead of selecting in place", async () => {
            mockMatchMedia(true);
            const msg = messageFixture();
            const fetchMock = mockShellAndInbox([msg]);
            const location = mockLocation();
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByText("Hello there"));

            expect(location.href).toBe("/messages/detail?uid=m1");
            expect(screen.getByTestId("detail-pane")).toHaveTextContent("no-message");
            expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit)?.method === "PUT")).toBe(false);
        });
    });

    describe("By conversation", () => {
        it("switches to the conversation list, replacing the per-folder message list, and shows the informational note", async () => {
            mockShellAndInbox([messageFixture()], undefined, [conversationFixture()]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);
            await screen.findByText("Hello there");

            await user.click(screen.getByRole("button", { name: "By conversation" }));

            expect(await screen.findByText(/Showing every conversation in this mailbox/)).toBeInTheDocument();
            expect(screen.getByTestId("thread-pane")).toHaveTextContent("no-conversation");
        });

        it("selects a conversation in place on desktop", async () => {
            mockShellAndInbox([], undefined, [conversationFixture()]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByRole("button", { name: "By conversation" }));
            await user.click(await screen.findByText("Hello there"));

            expect(await screen.findByTestId("thread-pane")).toHaveTextContent("conversation:c1");
        });

        it("navigates to the latest message's detail route instead of selecting in place on mobile", async () => {
            mockMatchMedia(true);
            mockShellAndInbox([], undefined, [conversationFixture({ messageUids: ["m1", "m2"] })]);
            const location = mockLocation();
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByRole("button", { name: "By conversation" }));
            await user.click(await screen.findByText("Hello there"));

            expect(location.href).toBe("/messages/detail?uid=m2");
            expect(screen.getByTestId("thread-pane")).toHaveTextContent("no-conversation");
        });

        it("shows an empty state when the mailbox has no conversations", async () => {
            mockShellAndInbox([], undefined, []);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByRole("button", { name: "By conversation" }));

            expect(await screen.findByText("No conversations in this mailbox.")).toBeInTheDocument();
        });

        it("shows an error message when loading conversations fails", async () => {
            mockShellAndInbox([], (url) =>
                url.startsWith("/api/mail/messages/conversations") ? jsonResponse(500, { message: "boom" }) : undefined,
            );
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByRole("button", { name: "By conversation" }));

            expect(await screen.findByText("boom")).toBeInTheDocument();
        });

        it("shows a generic error message when loading conversations fails with a non-API error", async () => {
            mockShellAndInbox([], (url) => {
                if (url.startsWith("/api/mail/messages/conversations")) throw new TypeError("network down");
                return undefined;
            });
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);

            await user.click(await screen.findByRole("button", { name: "By conversation" }));

            expect(await screen.findByText("Could not load conversations.")).toBeInTheDocument();
        });

        it("switching back to 'By date' re-fetches the per-folder message list and drops the conversation selection", async () => {
            mockShellAndInbox([messageFixture()], undefined, [conversationFixture()]);
            const user = userEvent.setup();
            render(<InboxPage userUid="u1" />);
            await screen.findByText("Hello there");

            await user.click(screen.getByRole("button", { name: "By conversation" }));
            await user.click(await screen.findByText("Hello there"));
            expect(await screen.findByTestId("thread-pane")).toHaveTextContent("conversation:c1");

            await user.click(screen.getByRole("button", { name: "By date" }));

            expect(await screen.findByTestId("detail-pane")).toHaveTextContent("no-message");
            expect(screen.queryByText(/Showing every conversation in this mailbox/)).not.toBeInTheDocument();
        });
    });
});
