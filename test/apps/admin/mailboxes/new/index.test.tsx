// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, mockLocation } from "../../../testUtils.js";
import NewMailboxPage from "../../../../../apps/admin/mailboxes/new/index.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("NewMailboxPage", () => {
    it("validates required fields before submitting", async () => {
        mockFetch(() => jsonResponse(200, {}));
        const user = userEvent.setup();
        render(<NewMailboxPage userUid="admin-1" authServerUrl="https://auth.example.com" />);
        await screen.findByText("New mailbox");

        await user.click(screen.getByRole("button", { name: "Create mailbox" }));
        expect(await screen.findByText("A primary SMTP address is required.")).toBeInTheDocument();

        await user.type(screen.getByLabelText("Primary SMTP address"), "support@example.com");
        await user.click(screen.getByRole("button", { name: "Create mailbox" }));
        expect(await screen.findByText("A display name is required.")).toBeInTheDocument();
    });

    it("creates the mailbox (with custom timezone/quota) and redirects to its detail page", async () => {
        let requestBody: any;
        mockFetch((url, init) => {
            if (url === "/api/admin/release-notes") return jsonResponse(200, {});
            if (url === "/api/mail/mailboxes" && init?.method === "POST") {
                requestBody = JSON.parse(init.body as string);
                return jsonResponse(200, { uid: "mb1" });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(<NewMailboxPage userUid="admin-1" authServerUrl="https://auth.example.com" />);
        await screen.findByText("New mailbox");

        await user.type(screen.getByLabelText("Primary SMTP address"), "support@example.com");
        await user.type(screen.getByLabelText("Display name"), "Support");
        await user.clear(screen.getByLabelText("Timezone"));
        await user.type(screen.getByLabelText("Timezone"), "America/Los_Angeles");
        await user.clear(screen.getByLabelText("Quota (GB)"));
        await user.type(screen.getByLabelText("Quota (GB)"), "10");
        await user.click(screen.getByRole("button", { name: "Create mailbox" }));

        await vi.waitFor(() => expect(location.href).toBe("/admin/mailboxes/detail?uid=mb1"));
        expect(requestBody.timezone).toBe("America/Los_Angeles");
        expect(requestBody.quotaBytes).toBe(10_000_000_000);
        expect(requestBody.ownerUserUid).toBeUndefined();
    });

    it("creates a mailbox with an explicit owner when one is provided", async () => {
        let requestBody: any;
        mockFetch((url, init) => {
            if (url === "/api/admin/release-notes") return jsonResponse(200, {});
            if (url === "/api/mail/mailboxes" && init?.method === "POST") {
                requestBody = JSON.parse(init.body as string);
                return jsonResponse(200, { uid: "mb2" });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(<NewMailboxPage userUid="admin-1" authServerUrl="https://auth.example.com" />);
        await screen.findByText("New mailbox");

        await user.type(screen.getByLabelText("Primary SMTP address"), "jdoe@example.com");
        await user.type(screen.getByLabelText("Display name"), "Jane Doe");
        await user.type(screen.getByLabelText("Owner user uid (optional)"), "jdoe");
        await user.click(screen.getByRole("button", { name: "Create mailbox" }));

        await vi.waitFor(() => expect(location.href).toBe("/admin/mailboxes/detail?uid=mb2"));
        expect(requestBody.ownerUserUid).toBe("jdoe");
    });

    it("shows an error message when creation fails", async () => {
        mockFetch((url, init) => {
            if (url === "/api/admin/release-notes") return jsonResponse(200, {});
            return jsonResponse(400, { message: "address already in use" });
        });
        const user = userEvent.setup();
        render(<NewMailboxPage userUid="admin-1" authServerUrl="https://auth.example.com" />);
        await screen.findByText("New mailbox");

        await user.type(screen.getByLabelText("Primary SMTP address"), "support@example.com");
        await user.type(screen.getByLabelText("Display name"), "Support");
        await user.click(screen.getByRole("button", { name: "Create mailbox" }));

        expect(await screen.findByText("address already in use")).toBeInTheDocument();
    });

    it("shows a generic error message when creation fails with a non-API error", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") return jsonResponse(200, {});
            throw new TypeError("network down");
        });
        const user = userEvent.setup();
        render(<NewMailboxPage userUid="admin-1" authServerUrl="https://auth.example.com" />);
        await screen.findByText("New mailbox");

        await user.type(screen.getByLabelText("Primary SMTP address"), "support@example.com");
        await user.type(screen.getByLabelText("Display name"), "Support");
        await user.click(screen.getByRole("button", { name: "Create mailbox" }));

        expect(await screen.findByText("Could not create the mailbox.")).toBeInTheDocument();
    });

    it("the Cancel link returns to the mailboxes list", async () => {
        mockFetch(() => jsonResponse(200, {}));
        render(<NewMailboxPage userUid="admin-1" authServerUrl="https://auth.example.com" />);
        expect(await screen.findByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/admin");
    });
});
