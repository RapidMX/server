// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MessageDetailPane from "../../../apps/shared/components/mail/MessageDetailPane.js";

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

describe("MessageDetailPane", () => {
    it("shows a placeholder and no back link when no message is given", () => {
        render(<MessageDetailPane message={null} attachments={[]} backHref="/messages/detail?uid=m1" />);
        expect(screen.getByText("Select a message to read it.")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Back to messages/ })).not.toBeInTheDocument();
    });

    it("renders the message header, iframe, and no back link when backHref is absent", () => {
        render(<MessageDetailPane message={messageFixture() as any} attachments={[]} />);

        expect(screen.getByRole("heading", { name: "Hello there" })).toBeInTheDocument();
        expect(screen.getByText(/From Sender One/)).toBeInTheDocument();
        expect(screen.getByText("To Me")).toBeInTheDocument();
        expect(screen.getByTitle("Hello there")).toHaveAttribute("src", "/api/mail/messages/m1/content");
        expect(screen.queryByRole("link", { name: /Back to messages/ })).not.toBeInTheDocument();
    });

    it("renders a back link when backHref is given", () => {
        render(
            <MessageDetailPane message={messageFixture() as any} attachments={[]} backHref="/?mailboxUid=mb1&folderUid=f1" />,
        );
        expect(screen.getByRole("link", { name: /Back to messages/ })).toHaveAttribute("href", "/?mailboxUid=mb1&folderUid=f1");
    });

    it("falls back to the raw address and '(no subject)' when displayName/subject are absent", () => {
        const message = messageFixture({
            subject: "",
            from: { address: "sender@example.com", type: "to" as const },
            recipients: [{ address: "u1@example.com", type: "to" as const }],
        });
        render(<MessageDetailPane message={message as any} attachments={[]} />);

        expect(screen.getByRole("heading", { name: "(no subject)" })).toBeInTheDocument();
        expect(screen.getByText(/From sender@example\.com/)).toBeInTheDocument();
        expect(screen.getByText("To u1@example.com")).toBeInTheDocument();
        expect(screen.getByTitle("Message content")).toBeInTheDocument();
    });

    it("lists and links to attachments when present", () => {
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
        render(<MessageDetailPane message={messageFixture() as any} attachments={[attachment]} />);

        const link = screen.getByRole("link", { name: /report\.pdf/ });
        expect(link).toHaveAttribute("href", "/api/mail/attachments/a1/content");
        expect(link.textContent).toContain("2.5 MB");
    });

    it("renders no attachment list when there are none", () => {
        render(<MessageDetailPane message={messageFixture() as any} attachments={[]} />);
        expect(screen.queryByRole("link", { name: /pdf|txt/ })).not.toBeInTheDocument();
    });

    it("formats attachment sizes across byte/KB/MB tiers", () => {
        const attachments = [
            { uid: "a1", version: 0, dateCreated: "", dateModified: "", messageUid: "m1", folderUid: "f1", mailboxUid: "mb1", filename: "tiny.txt", mimeType: "text/plain", sizeBytes: 500, isInline: false },
            { uid: "a2", version: 0, dateCreated: "", dateModified: "", messageUid: "m1", folderUid: "f1", mailboxUid: "mb1", filename: "medium.txt", mimeType: "text/plain", sizeBytes: 2_500, isInline: false },
            { uid: "a3", version: 0, dateCreated: "", dateModified: "", messageUid: "m1", folderUid: "f1", mailboxUid: "mb1", filename: "big.pdf", mimeType: "application/pdf", sizeBytes: 2_500_000, isInline: false },
        ];
        render(<MessageDetailPane message={messageFixture() as any} attachments={attachments} />);

        expect(screen.getByText(/tiny\.txt \(500 B\)/)).toBeInTheDocument();
        expect(screen.getByText(/medium\.txt \(2\.5 KB\)/)).toBeInTheDocument();
        expect(screen.getByText(/big\.pdf \(2\.5 MB\)/)).toBeInTheDocument();
    });
});
