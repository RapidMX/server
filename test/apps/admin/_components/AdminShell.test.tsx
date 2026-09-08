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
        render(
            <AdminShell active="mailboxes" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
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
            <AdminShell active="mailboxes" userUid="u1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        expect(await screen.findByText("You do not have administrator access.")).toBeInTheDocument();
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("shows an error message when the authorization check fails for a reason other than 401/403", async () => {
        mockFetch(() => jsonResponse(500, { message: "boom" }));
        render(
            <AdminShell active="mailboxes" userUid="u1" authServerUrl={AUTH_SERVER_URL}>
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
            <AdminShell active="mailboxes" userUid="u1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        expect(await screen.findByText("Could not verify administrator access.")).toBeInTheDocument();
    });

    it("renders the icon rail with all four sections, highlighting the active one", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") return jsonResponse(200, {});
            throw new Error(`unexpected ${url}`);
        });
        render(
            <AdminShell active="quarantine" userUid="admin-1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        await screen.findByText("content");

        const rail = within(screen.getByRole("navigation", { name: "Admin sections" }));
        const mailboxes = rail.getByRole("link", { name: "Mailboxes" });
        const quarantine = rail.getByRole("link", { name: "Quarantine" });
        const ingestQueue = rail.getByRole("link", { name: "Ingest Queue" });
        const domains = rail.getByRole("link", { name: "Domains" });

        expect(mailboxes).toHaveAttribute("href", "/admin");
        expect(quarantine).toHaveAttribute("href", "/admin/quarantine");
        expect(ingestQueue).toHaveAttribute("href", "/admin/ingest-queue");
        expect(domains).toHaveAttribute("href", "/admin/domains");

        expect(quarantine).toHaveAttribute("aria-current", "page");
        expect(quarantine.className).toContain("bg-primary/10");
        expect(mailboxes).not.toHaveAttribute("aria-current");
        expect(mailboxes.className).not.toContain("bg-primary/10");
    });

    it("hides the icon rail below md, shows it at md and above", async () => {
        mockFetch(() => jsonResponse(200, {}));
        render(
            <AdminShell active="mailboxes" userUid="admin-1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        await screen.findByText("content");
        expect(screen.getByRole("navigation", { name: "Admin sections" })).toHaveClass("hidden", "md:flex");
    });

    it("renders the mobile bottom tab bar with the same sections, highlighting the active one", async () => {
        mockFetch(() => jsonResponse(200, {}));
        render(
            <AdminShell active="ingestQueue" userUid="admin-1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );
        await screen.findByText("content");

        const tabBar = within(screen.getByRole("navigation", { name: "Mobile navigation" }));
        expect(tabBar.getByRole("link", { name: "Ingest Queue" })).toHaveAttribute("aria-current", "page");
        expect(tabBar.getByRole("link", { name: "Mailboxes" })).not.toHaveAttribute("aria-current");
    });

    it("shows the header with the active section's label and renders children, and signs out to auth-server", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            throw new Error(`unexpected ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <AdminShell active="mailboxes" userUid="admin-1" authServerUrl={AUTH_SERVER_URL}>
                content
            </AdminShell>,
        );

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByText("Mailboxes", { selector: "span" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Account menu" }));
        expect(screen.getByText("admin-1")).toBeInTheDocument();
        await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));
        expect(location.href).toBe(AUTH_SERVER_URL);
    });

    it("signs out to '/' when authServerUrl is not configured", async () => {
        mockFetch(() => jsonResponse(200, {}));
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <AdminShell active="mailboxes" userUid="admin-1">
                content
            </AdminShell>,
        );

        await screen.findByText("content");
        await user.click(screen.getByRole("button", { name: "Account menu" }));
        await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));
        expect(location.href).toBe("/");
    });
});
