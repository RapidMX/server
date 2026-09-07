// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, mockLocation } from "../testUtils.js";
import MailShell, { useMailShell } from "../../../apps/shared/components/mail/layout/MailShell.js";

const AUTH_SERVER_URL = "https://auth.example.com";

const mailboxA = {
    uid: "mb-a",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    ownerUserUid: "u1",
    primarySmtpAddress: "a@example.com",
    aliasAddresses: [],
    displayName: "Mailbox A",
    timezone: "UTC",
    quotaBytes: 1_000_000_000,
    usedBytes: 0,
};
const mailboxB = { ...mailboxA, uid: "mb-b", displayName: "Mailbox B", ownerUserUid: undefined };

const inboxFolder = {
    uid: "f-inbox",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb-a",
    name: "Inbox",
    type: "inbox" as const,
    unreadCount: 3,
    totalCount: 10,
};
const draftsFolder = {
    ...inboxFolder,
    uid: "f-drafts",
    name: "Drafts",
    type: "drafts" as const,
    unreadCount: 0,
};

function mockMailboxesAndFolders(mailboxes: unknown[], folders: unknown[]) {
    return mockFetch((url) => {
        if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, mailboxes);
        if (url.startsWith("/api/mail/folders")) return jsonResponse(200, folders);
        throw new Error(`unexpected ${url}`);
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("MailShell", () => {
    it("redirects to auth-server's sign-in page when there is no userUid", async () => {
        const location = mockLocation();
        location.href = "https://mail.example.com/";
        render(<MailShell authServerUrl={AUTH_SERVER_URL}>content</MailShell>);
        await waitFor(() =>
            expect(location.href).toBe(`${AUTH_SERVER_URL}/auth/signin?return_to=${encodeURIComponent("https://mail.example.com/")}`),
        );
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("shows an error message when loading mailboxes fails", async () => {
        mockFetch(() => jsonResponse(500, { message: "boom" }));
        render(<MailShell userUid="u1">content</MailShell>);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when loading mailboxes fails with a non-API error", async () => {
        mockFetch(() => {
            throw new TypeError("network down");
        });
        render(<MailShell userUid="u1">content</MailShell>);
        expect(await screen.findByText("Could not load your mailboxes.")).toBeInTheDocument();
    });

    it("shows a no-mailboxes message and renders no compose/switcher chrome when the caller has none", async () => {
        mockMailboxesAndFolders([], []);
        render(<MailShell userUid="u1">content</MailShell>);
        expect(await screen.findByText("No mailboxes available.")).toBeInTheDocument();
        expect(screen.getByText("content")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Compose" })).toHaveAttribute("href", "/compose");
    });

    it("renders a single mailbox's folders (well-known order) with no mailbox switcher", async () => {
        mockMailboxesAndFolders([mailboxA], [draftsFolder, inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        await screen.findByText("Inbox");
        expect(screen.queryByLabelText("Mailbox")).not.toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument(); // Inbox unread badge
        expect(screen.getByRole("link", { name: "Compose" })).toHaveAttribute("href", "/compose?mailboxUid=mb-a");

        const folderLinks = screen.getAllByRole("link").filter((el) => el.getAttribute("href")?.includes("folderUid="));
        expect(folderLinks.map((el) => el.getAttribute("href"))).toEqual([
            "/?mailboxUid=mb-a&folderUid=f-inbox",
            "/?mailboxUid=mb-a&folderUid=f-drafts",
        ]);
    });

    it("defaults to the mailbox's Inbox folder and highlights it", async () => {
        mockMailboxesAndFolders([mailboxA], [draftsFolder, inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        const inboxLink = await screen.findByRole("link", { name: /Inbox/ });
        expect(inboxLink.className).toContain("bg-primary/10");
        const draftsLink = screen.getByRole("link", { name: "Drafts" });
        expect(draftsLink.className).not.toContain("bg-primary/10");
    });

    it("shows the mailbox switcher when more than one mailbox is accessible, marking a shared one", async () => {
        mockMailboxesAndFolders([mailboxA, mailboxB], [inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        await screen.findByLabelText("Mailbox");
        expect(screen.getByRole("option", { name: "Mailbox A" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Mailbox B (shared)" })).toBeInTheDocument();
    });

    it("navigates to the chosen mailbox when the switcher's selection changes", async () => {
        mockMailboxesAndFolders([mailboxA, mailboxB], [inboxFolder]);
        const location = mockLocation();
        const user = userEvent.setup();
        render(<MailShell userUid="u1">content</MailShell>);

        const select = await screen.findByLabelText("Mailbox");
        await user.selectOptions(select, "mb-b");

        expect(location.href).toBe("/?mailboxUid=mb-b");
    });

    it("shows an error message when loading folders fails", async () => {
        mockFetch((url) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailboxA]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(500, { message: "folder boom" });
            throw new Error(`unexpected ${url}`);
        });
        render(<MailShell userUid="u1">content</MailShell>);
        expect(await screen.findByText("folder boom")).toBeInTheDocument();
    });

    it("shows a generic error message when loading folders fails with a non-API error", async () => {
        mockFetch((url) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailboxA]);
            throw new TypeError("network down");
        });
        render(<MailShell userUid="u1">content</MailShell>);
        expect(await screen.findByText("Could not load folders.")).toBeInTheDocument();
    });

    it("signs out to auth-server", async () => {
        mockMailboxesAndFolders([mailboxA], [inboxFolder]);
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <MailShell userUid="u1" authServerUrl={AUTH_SERVER_URL}>
                content
            </MailShell>,
        );

        await screen.findByText("content");
        await user.click(screen.getByRole("button", { name: "Account menu" }));
        await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));
        expect(location.href).toBe(AUTH_SERVER_URL);
    });

    it("signs out to '/' when authServerUrl is not configured", async () => {
        mockMailboxesAndFolders([mailboxA], [inboxFolder]);
        const location = mockLocation();
        const user = userEvent.setup();
        render(<MailShell userUid="u1">content</MailShell>);

        await screen.findByText("content");
        await user.click(screen.getByRole("button", { name: "Account menu" }));
        await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));
        expect(location.href).toBe("/");
    });

    it("sorts folders not in the well-known order alphabetically by name, after well-known folders", async () => {
        const projectsFolder = { ...inboxFolder, uid: "f-projects", name: "Projects", type: "user" as const, unreadCount: 0 };
        const archiveFolder = { ...inboxFolder, uid: "f-archive", name: "Archive", type: "user" as const, unreadCount: 0 };
        mockMailboxesAndFolders([mailboxA], [projectsFolder, inboxFolder, archiveFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        await screen.findByText("Inbox");
        const folderLinks = screen.getAllByRole("link").filter((el) => el.getAttribute("href")?.includes("folderUid="));
        expect(folderLinks.map((el) => el.textContent)).toEqual(["Inbox3", "Archive", "Projects"]);
    });

    it("honors a ?mailboxUid= query param that names an accessible mailbox", async () => {
        const location = mockLocation();
        (location as any).search = "?mailboxUid=mb-b";
        mockMailboxesAndFolders([mailboxA, mailboxB], [inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        const select = await screen.findByLabelText("Mailbox");
        expect(select).toHaveValue("mb-b");
    });

    it("ignores a ?mailboxUid= query param that isn't one of the caller's accessible mailboxes", async () => {
        const location = mockLocation();
        (location as any).search = "?mailboxUid=not-mine";
        mockMailboxesAndFolders([mailboxA, mailboxB], [inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        const select = await screen.findByLabelText("Mailbox");
        expect(select).toHaveValue("mb-a");
    });

    it("honors a ?folderUid= query param that names one of the mailbox's folders", async () => {
        const location = mockLocation();
        (location as any).search = "?folderUid=f-drafts";
        mockMailboxesAndFolders([mailboxA], [draftsFolder, inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        const draftsLink = await screen.findByRole("link", { name: "Drafts" });
        expect(draftsLink.className).toContain("bg-primary/10");
    });

    it("ignores a ?folderUid= query param that isn't one of the mailbox's folders", async () => {
        const location = mockLocation();
        (location as any).search = "?folderUid=not-a-folder";
        mockMailboxesAndFolders([mailboxA], [draftsFolder, inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);

        const inboxLink = await screen.findByRole("link", { name: /Inbox/ });
        expect(inboxLink.className).toContain("bg-primary/10");
    });

    it("does not show the impersonation banner when impersonating is not set", async () => {
        mockMailboxesAndFolders([mailboxA], [inboxFolder]);
        render(<MailShell userUid="u1">content</MailShell>);
        await screen.findByText("content");
        expect(screen.queryByText(/You are viewing as/)).not.toBeInTheDocument();
    });

    it("shows the impersonation banner and returns to admin when 'Return to admin' is clicked", async () => {
        mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailboxA]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [inboxFolder]);
            if (url === "https://auth.example.com/api/admin/impersonate/stop" && init?.method === "GET") {
                return jsonResponse(200, { restored: true });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <MailShell userUid="u1" authServerUrl={AUTH_SERVER_URL} impersonationBaseUrl={AUTH_SERVER_URL} impersonating>
                content
            </MailShell>,
        );

        expect(await screen.findByText(/You are viewing as/)).toBeInTheDocument();
        expect(screen.getByText("u1", { selector: "strong" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Return to admin" }));

        expect(await screen.findByRole("button", { name: "Returning to admin…" })).toBeInTheDocument();
        await waitFor(() => expect(location.href).toBe("/admin"));
    });

    it("still returns to admin even when the stop-impersonating request fails", async () => {
        mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailboxA]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [inboxFolder]);
            if (url === "https://auth.example.com/api/admin/impersonate/stop" && init?.method === "GET") {
                return jsonResponse(500, { message: "boom" });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <MailShell userUid="u1" authServerUrl={AUTH_SERVER_URL} impersonationBaseUrl={AUTH_SERVER_URL} impersonating>
                content
            </MailShell>,
        );

        await user.click(await screen.findByRole("button", { name: "Return to admin" }));
        await waitFor(() => expect(location.href).toBe("/admin"));
    });

    it("calls this app's own local dev-only stop endpoint when impersonationBaseUrl isn't provided (yarn dev)", async () => {
        mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailboxA]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [inboxFolder]);
            if (url === "/api/admin/impersonate/stop" && init?.method === "GET") {
                return jsonResponse(200, { restored: true });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <MailShell userUid="u1" impersonating>
                content
            </MailShell>,
        );

        await user.click(await screen.findByRole("button", { name: "Return to admin" }));
        await waitFor(() => expect(location.href).toBe("/admin"));
    });

    it("provides the resolved mailbox/folder/lists to children via useMailShell()", async () => {
        function Probe() {
            const { mailboxUid, folderUid, mailboxes, folders } = useMailShell();
            return (
                <span>{`${mailboxUid}/${folderUid}/${mailboxes.length}/${folders.length}`}</span>
            );
        }
        mockMailboxesAndFolders([mailboxA], [draftsFolder, inboxFolder]);
        render(
            <MailShell userUid="u1">
                <Probe />
            </MailShell>,
        );

        expect(await screen.findByText("mb-a/f-inbox/1/2")).toBeInTheDocument();
    });
});
