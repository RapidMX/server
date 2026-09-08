// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, mockLocation } from "../../testUtils.js";
import AdminShell from "../../../../apps/shared/components/admin/layout/AdminShell.js";

const AUTH_SERVER_URL = "https://auth.example.com";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AdminShell", () => {
    it("redirects to auth-server's sign-in page, carrying return_to, when there is no userUid", async () => {
        const location = mockLocation();
        location.href = "https://mail.example.com/admin";
        render(<AdminShell authServerUrl={AUTH_SERVER_URL}>content</AdminShell>);
        await waitFor(() =>
            expect(location.href).toBe(
                `${AUTH_SERVER_URL}/auth/signin?return_to=${encodeURIComponent("https://mail.example.com/admin")}`,
            ),
        );
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("shows an access-denied message when the /admin canary returns 403", async () => {
        mockFetch(() => jsonResponse(403, { code: "api-103", message: "User does not have permission." }));
        render(
            <AdminShell userUid="u1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        expect(await screen.findByText("You do not have administrator access.")).toBeInTheDocument();
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("shows an error message when the authorization check fails for a reason other than 401/403", async () => {
        mockFetch(() => jsonResponse(500, { message: "boom" }));
        render(
            <AdminShell userUid="u1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when the authorization check fails with a non-API error", async () => {
        mockFetch(() => {
            throw new TypeError("network down");
        });
        render(
            <AdminShell userUid="u1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        expect(await screen.findByText("Could not verify administrator access.")).toBeInTheDocument();
    });

    it("renders the nav chrome and children once authorized, and signs out to auth-server", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            throw new Error(`unexpected ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <AdminShell userUid="admin-1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Mailboxes" })).toHaveAttribute("href", "/admin");
        expect(screen.getByRole("link", { name: "Quarantine" })).toHaveAttribute("href", "/admin/quarantine");
        expect(screen.getByRole("link", { name: "Ingest Queue" })).toHaveAttribute("href", "/admin/ingest-queue");

        await user.click(screen.getByRole("button", { name: "Account menu" }));
        expect(screen.getByText("admin-1")).toBeInTheDocument();
        await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));
        expect(location.href).toBe(AUTH_SERVER_URL);
    });

    it("opens the mobile menu drawer, navigates via one of its links, and can be closed", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") return jsonResponse(200, {});
            throw new Error(`unexpected ${url}`);
        });
        const user = userEvent.setup();
        render(
            <AdminShell userUid="admin-1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        await screen.findByText("content");

        expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Open menu" }));
        const drawer = screen.getByRole("dialog", { name: "Menu" });
        const quarantineLink = within(drawer).getByRole("link", { name: "Quarantine" });
        expect(quarantineLink).toHaveAttribute("href", "/admin/quarantine");

        await user.click(quarantineLink);
        expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    });

    it("closes the mobile menu drawer via its own Close button", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") return jsonResponse(200, {});
            throw new Error(`unexpected ${url}`);
        });
        const user = userEvent.setup();
        render(
            <AdminShell userUid="admin-1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        await screen.findByText("content");

        await user.click(screen.getByRole("button", { name: "Open menu" }));
        const drawer = screen.getByRole("dialog", { name: "Menu" });
        await user.click(within(drawer).getByRole("button", { name: "Close" }));

        expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    });

    it("signs out to '/' when authServerUrl is not configured", async () => {
        mockFetch(() => jsonResponse(200, {}));
        const location = mockLocation();
        const user = userEvent.setup();
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        await screen.findByText("content");
        await user.click(screen.getByRole("button", { name: "Account menu" }));
        await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));
        expect(location.href).toBe("/");
    });
});
