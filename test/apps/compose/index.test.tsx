// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import ComposePage from "../../../apps/www/compose/index.js";

vi.mock("../../../apps/shared/components/mail/compose/RichTextEditor.js", () => ({
    default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <textarea data-testid="html-editor" value={value} onChange={(e) => onChange(e.target.value)} />
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
const draftsFolder = {
    uid: "f-drafts",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    name: "Drafts",
    type: "drafts" as const,
    unreadCount: 0,
    totalCount: 0,
};
const draft = {
    uid: "m1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    folderUid: "f-drafts",
    mailboxUid: "mb1",
    messageId: "abc@webmail",
    subject: "",
    from: { address: "u1@example.com", type: "to" as const },
    recipients: [],
    sentDate: "2026-01-01T00:00:00.000Z",
    receivedDate: "2026-01-01T00:00:00.000Z",
    bodyPreview: "",
    flags: { read: true, flagged: false, answered: false, forwarded: false },
    importance: "normal" as const,
    hasAttachments: false,
};

function mockShellAndCompose(extra?: (url: string, init?: RequestInit) => Response | undefined) {
    return mockFetch((url, init) => {
        const custom = extra?.(url, init);
        if (custom) return custom;
        if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
        if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [draftsFolder]);
        if (url === "/api/mail/messages" && (init?.method ?? "GET") === "POST") return jsonResponse(200, draft);
        throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("ComposePage", () => {
    it("creates a blank draft once the mailbox/Drafts folder resolve", async () => {
        const fetchMock = mockShellAndCompose();
        render(<ComposePage userUid="u1" />);
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages", expect.objectContaining({ method: "POST" })),
        );
        expect(screen.getByLabelText("Attachments")).not.toBeDisabled();
    });

    it("shows an error message when starting the draft fails", async () => {
        mockShellAndCompose((url, init) =>
            url === "/api/mail/messages" && (init?.method ?? "GET") === "POST" ? jsonResponse(500, { message: "boom" }) : undefined,
        );
        render(<ComposePage userUid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when starting the draft fails with a non-API error", async () => {
        mockShellAndCompose((url, init) => {
            if (url === "/api/mail/messages" && (init?.method ?? "GET") === "POST") throw new TypeError("network down");
            return undefined;
        });
        render(<ComposePage userUid="u1" />);
        expect(await screen.findByText("Could not start a new draft.")).toBeInTheDocument();
    });

    it("does nothing if the form is somehow submitted before the draft has loaded", async () => {
        let resolveDraft: (() => void) | undefined;
        mockShellAndCompose((url, init) => {
            if (url === "/api/mail/messages" && (init?.method ?? "GET") === "POST") {
                return new Promise((resolve) => {
                    resolveDraft = () => resolve(jsonResponse(200, draft));
                });
            }
            return undefined;
        });
        const { container } = render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(resolveDraft).toBeDefined());

        fireEvent.submit(container.querySelector("form")!);

        expect(screen.queryByText("At least one recipient is required.")).not.toBeInTheDocument();
        resolveDraft!();
    });

    it("requires at least one recipient before sending", async () => {
        mockShellAndCompose();
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        await user.click(screen.getByRole("button", { name: "Send" }));

        expect(await screen.findByText("At least one recipient is required.")).toBeInTheDocument();
    });

    it("reveals Cc/Bcc fields on request", async () => {
        mockShellAndCompose();
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        expect(screen.queryByLabelText("Cc")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Add Cc/Bcc" }));
        await user.type(screen.getByLabelText("Cc"), "cc@example.com");
        await user.type(screen.getByLabelText("Bcc"), "bcc@example.com");
        expect(screen.getByLabelText("Cc")).toHaveValue("cc@example.com");
        expect(screen.getByLabelText("Bcc")).toHaveValue("bcc@example.com");
    });

    it("assembles and sends the draft, then shows a confirmation", async () => {
        const fetchMock = mockShellAndCompose((url, init) => {
            const method = init?.method ?? "GET";
            if (url === "/api/mail/compose/m1/assemble" && method === "POST") return jsonResponse(200, draft);
            if (url === "/api/mail/messages/m1/send" && method === "POST") return jsonResponse(200, draft);
            return undefined;
        });
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        await user.type(screen.getByLabelText("To"), "b@example.com, c@example.com");
        await user.type(screen.getByLabelText("Subject"), "Hi there");
        await user.type(screen.getByTestId("html-editor"), "<p>hello</p>");

        await user.click(screen.getByRole("button", { name: "Send" }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/mail/compose/m1/assemble",
                expect.objectContaining({ method: "POST" }),
            ),
        );
        const assembleCall = fetchMock.mock.calls.find((call) => call[0] === "/api/mail/compose/m1/assemble")!;
        const body = JSON.parse((assembleCall[1] as RequestInit).body as string);
        expect(body.to).toEqual([{ address: "b@example.com" }, { address: "c@example.com" }]);
        expect(body.subject).toBe("Hi there");

        expect(await screen.findByText("Message sent.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Back to Inbox/ })).toHaveAttribute("href", "/");
    });

    it("shows an error message when assembling fails", async () => {
        mockShellAndCompose((url, init) =>
            url === "/api/mail/compose/m1/assemble" && (init?.method ?? "GET") === "POST"
                ? jsonResponse(500, { message: "assemble failed" })
                : undefined,
        );
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        await user.type(screen.getByLabelText("To"), "b@example.com");
        await user.click(screen.getByRole("button", { name: "Send" }));

        expect(await screen.findByText("assemble failed")).toBeInTheDocument();
    });

    it("shows a generic error message when sending fails with a non-API error", async () => {
        mockShellAndCompose((url, init) => {
            if (url === "/api/mail/compose/m1/assemble" && (init?.method ?? "GET") === "POST") return jsonResponse(200, draft);
            if (url === "/api/mail/messages/m1/send") throw new TypeError("network down");
            return undefined;
        });
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        await user.type(screen.getByLabelText("To"), "b@example.com");
        await user.click(screen.getByRole("button", { name: "Send" }));

        expect(await screen.findByText("Could not send this message.")).toBeInTheDocument();
    });

    it("uploads a selected attachment against the draft and lists it", async () => {
        const attachment = {
            uid: "a1",
            version: 0,
            dateCreated: "2026-01-01T00:00:00.000Z",
            dateModified: "2026-01-01T00:00:00.000Z",
            messageUid: "m1",
            folderUid: "f-drafts",
            mailboxUid: "mb1",
            filename: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 12,
            isInline: false,
        };
        mockShellAndCompose((url, init) =>
            url.startsWith("/api/mail/attachments/upload") && (init?.method ?? "GET") === "POST"
                ? jsonResponse(200, attachment)
                : undefined,
        );
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        const file = new File(["hello"], "notes.txt", { type: "text/plain" });
        await user.upload(screen.getByLabelText("Attachments"), file);

        expect(await screen.findByText("notes.txt")).toBeInTheDocument();
    });

    it("shows an error message when an attachment upload fails", async () => {
        mockShellAndCompose((url, init) =>
            url.startsWith("/api/mail/attachments/upload") && (init?.method ?? "GET") === "POST"
                ? jsonResponse(500, { message: "too large" })
                : undefined,
        );
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        const file = new File(["hello"], "big.bin", { type: "application/octet-stream" });
        await user.upload(screen.getByLabelText("Attachments"), file);

        expect(await screen.findByText("too large")).toBeInTheDocument();
    });

    it("shows a generic error message when an attachment upload fails with a non-API error", async () => {
        mockShellAndCompose((url, init) => {
            if (url.startsWith("/api/mail/attachments/upload") && (init?.method ?? "GET") === "POST") {
                throw new TypeError("network down");
            }
            return undefined;
        });
        const user = userEvent.setup();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        const file = new File(["hello"], "big.bin", { type: "application/octet-stream" });
        await user.upload(screen.getByLabelText("Attachments"), file);

        expect(await screen.findByText("Could not upload attachment.")).toBeInTheDocument();
    });

    it("ignores a change event with no file list", async () => {
        mockShellAndCompose();
        render(<ComposePage userUid="u1" />);
        await waitFor(() => expect(screen.getByLabelText("Attachments")).not.toBeDisabled());

        const input = screen.getByLabelText("Attachments");
        Object.defineProperty(input, "files", { value: null, configurable: true });
        fireEvent.change(input);

        expect(screen.queryByText(/too large|boom/)).not.toBeInTheDocument();
    });
});
