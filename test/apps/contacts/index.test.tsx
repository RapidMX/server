// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import ContactsPage from "../../../apps/www/contacts/index.js";

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
const contactsFolder = {
    uid: "f-contacts",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    name: "Contacts",
    type: "contacts" as const,
    unreadCount: 0,
    totalCount: 0,
};
const jane = {
    uid: "c1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    folderUid: "f-contacts",
    displayName: "Jane Doe",
    givenName: "Jane",
    surname: "Doe",
    emails: [{ address: "jane@example.com", type: "work" as const }],
    phones: [{ phoneNumber: "555-1234", type: "home" as const }],
    addresses: [{ street: "123 Main St", city: "Springfield", state: "IL", postalCode: "62701", country: "USA", type: "home" as const }],
    company: "Acme",
    jobTitle: "Engineer",
    notes: "VIP customer",
};
const bob = {
    uid: "c2",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    folderUid: "f-contacts",
    displayName: "Bob Smith",
    emails: [],
    phones: [],
    addresses: [],
};

function mockShellAndContacts(
    contacts: unknown[],
    extra?: (url: string, init?: RequestInit) => Response | undefined,
    folders: unknown[] = [contactsFolder],
) {
    return mockFetch((url, init) => {
        const custom = extra?.(url, init);
        if (custom) return custom;
        if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
        if (url.startsWith("/api/mail/folders")) return jsonResponse(200, folders);
        if (url.startsWith("/api/mail/contacts") && (init?.method ?? "GET") === "GET") return jsonResponse(200, contacts);
        throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("ContactsPage", () => {
    it("loads and lists contacts, filtering by name or email as the user types", async () => {
        mockShellAndContacts([jane, bob]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await screen.findByText("Jane Doe");
        expect(screen.getByText("Bob Smith")).toBeInTheDocument();
        expect(screen.getByText("jane@example.com")).toBeInTheDocument();

        await user.type(screen.getByLabelText("Search contacts"), "bob");
        expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
        expect(screen.getByText("Bob Smith")).toBeInTheDocument();

        await user.clear(screen.getByLabelText("Search contacts"));
        await user.type(screen.getByLabelText("Search contacts"), "jane@example");
        expect(screen.getByText("Jane Doe")).toBeInTheDocument();
        expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument();

        await user.clear(screen.getByLabelText("Search contacts"));
        await user.type(screen.getByLabelText("Search contacts"), "nobody");
        expect(await screen.findByText("No contacts found.")).toBeInTheDocument();
    });

    it("shows 'No contacts found.' when the list is empty", async () => {
        mockShellAndContacts([]);
        render(<ContactsPage userUid="u1" />);
        expect(await screen.findByText("No contacts found.")).toBeInTheDocument();
    });

    it("shows an error message when loading contacts fails", async () => {
        mockShellAndContacts([], (url, init) =>
            url.startsWith("/api/mail/contacts") && (init?.method ?? "GET") === "GET" ? jsonResponse(500, { message: "boom" }) : undefined,
        );
        render(<ContactsPage userUid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when loading contacts fails with a non-API error", async () => {
        mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [contactsFolder]);
            throw new TypeError("network down");
        });
        render(<ContactsPage userUid="u1" />);
        expect(await screen.findByText("Could not load contacts.")).toBeInTheDocument();
    });

    it("shows the 'select a contact' placeholder, and no list flashes 'Loading…' forever, when the mailbox has no contacts folder yet", async () => {
        mockShellAndContacts([], undefined, []);
        render(<ContactsPage userUid="u1" />);
        expect(await screen.findByText("Select a contact, or create a new one.")).toBeInTheDocument();
        expect(await screen.findByText("No contacts found.")).toBeInTheDocument();
    });

    it("selecting a contact shows its full detail view", async () => {
        mockShellAndContacts([jane, bob]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByText("Jane Doe"));

        expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
        expect(screen.getByText("Engineer at Acme")).toBeInTheDocument();
        expect(screen.getAllByText(/jane@example\.com/)).toHaveLength(2); // sidebar preview + detail panel
        expect(screen.getByText("(work)")).toBeInTheDocument();
        expect(screen.getByText(/555-1234/)).toBeInTheDocument();
        expect(screen.getByText("123 Main St, Springfield, IL, 62701, USA")).toBeInTheDocument();
        expect(screen.getByText("VIP customer")).toBeInTheDocument();
    });

    it("detail view omits empty sections (no company/title, email, phone, address, notes)", async () => {
        mockShellAndContacts([jane, bob]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByText("Bob Smith"));

        expect(screen.getByRole("heading", { name: "Bob Smith" })).toBeInTheDocument();
        expect(screen.queryByText(/ at /)).not.toBeInTheDocument();
        expect(screen.queryByText("Email")).not.toBeInTheDocument();
        expect(screen.queryByText("Phone")).not.toBeInTheDocument();
        expect(screen.queryByText("Address")).not.toBeInTheDocument();
        expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    });

    it("clicking + New contact shows a blank form", async () => {
        mockShellAndContacts([jane]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await screen.findByText("Jane Doe");
        await user.click(screen.getByRole("button", { name: "+ New contact" }));

        expect(screen.getByRole("heading", { name: "New contact" })).toBeInTheDocument();
        expect(screen.getByLabelText("Display name")).toHaveValue("");
    });

    it("creating a new contact posts the input and shows the saved contact", async () => {
        const created = { ...jane, uid: "c3", displayName: "New Person", emails: [], phones: [], addresses: [], notes: undefined };
        // The list panel's post-save `reload()` must see the newly created contact, so this mock's GET
        // response reflects whatever's been POSTed so far, rather than a fixed list.
        let allContacts: unknown[] = [];
        const fetchMock = mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [contactsFolder]);
            if (url === "/api/mail/contacts" && init?.method === "POST") {
                allContacts = [...allContacts, created];
                return jsonResponse(200, created);
            }
            if (url.startsWith("/api/mail/contacts") && (init?.method ?? "GET") === "GET") return jsonResponse(200, allContacts);
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: "+ New contact" }));
        await user.type(screen.getByLabelText("Display name"), "New Person");
        await user.type(screen.getByLabelText("First name"), "New");
        await user.type(screen.getByLabelText("Last name"), "Person");
        await user.type(screen.getByLabelText("Company"), "Acme");
        await user.type(screen.getByLabelText("Job title"), "Engineer");
        await user.type(screen.getByLabelText("Notes"), "Met at conference");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/mail/contacts",
                expect.objectContaining({ method: "POST" }),
            ),
        );
        const body = JSON.parse(
            (fetchMock.mock.calls.find((c) => c[0] === "/api/mail/contacts" && (c[1] as RequestInit).method === "POST")![1] as RequestInit)
                .body as string,
        );
        expect(body).toEqual(
            expect.objectContaining({
                mailboxUid: "mb1",
                folderUid: "f-contacts",
                displayName: "New Person",
                givenName: "New",
                surname: "Person",
                company: "Acme",
                jobTitle: "Engineer",
                notes: "Met at conference",
                emails: [],
                phones: [],
                addresses: [],
            }),
        );
        expect(await screen.findByRole("heading", { name: "New Person" })).toBeInTheDocument();
    });

    it("shows a validation error and does not submit when display name is blank", async () => {
        const fetchMock = mockShellAndContacts([]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: "+ New contact" }));
        const callsBefore = fetchMock.mock.calls.length;
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("A display name is required.")).toBeInTheDocument();
        expect(fetchMock.mock.calls.length).toBe(callsBefore);
    });

    it("shows an error message when creating a contact fails", async () => {
        mockShellAndContacts([], (url, init) =>
            url === "/api/mail/contacts" && init?.method === "POST" ? jsonResponse(500, { message: "create failed" }) : undefined,
        );
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: "+ New contact" }));
        await user.type(screen.getByLabelText("Display name"), "New Person");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("create failed")).toBeInTheDocument();
    });

    it("shows a generic error message when creating a contact fails with a non-API error", async () => {
        mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [contactsFolder]);
            if (url.startsWith("/api/mail/contacts") && (init?.method ?? "GET") === "GET") return jsonResponse(200, []);
            throw new TypeError("network down");
        });
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: "+ New contact" }));
        await user.type(screen.getByLabelText("Display name"), "New Person");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("Could not save this contact.")).toBeInTheDocument();
    });

    it("editing a contact pre-fills the form and PUTs the changes", async () => {
        // Same reasoning as the "creating" test above: the post-save `reload()` must see the rename.
        let allContacts: unknown[] = [jane];
        const fetchMock = mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [contactsFolder]);
            if (url === "/api/mail/contacts/c1" && init?.method === "PUT") {
                const renamed = { ...jane, displayName: "Jane Renamed" };
                allContacts = allContacts.map((c) => ((c as { uid: string }).uid === "c1" ? renamed : c));
                return jsonResponse(200, renamed);
            }
            if (url.startsWith("/api/mail/contacts") && (init?.method ?? "GET") === "GET") return jsonResponse(200, allContacts);
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByText("Jane Doe"));
        await user.click(screen.getByRole("button", { name: "Edit" }));

        expect(screen.getByLabelText("Display name")).toHaveValue("Jane Doe");
        expect(screen.getByLabelText("First name")).toHaveValue("Jane");
        expect(screen.getByLabelText("Email address 1")).toHaveValue("jane@example.com");
        expect(screen.getByLabelText("Phone number 1")).toHaveValue("555-1234");

        await user.clear(screen.getByLabelText("Display name"));
        await user.type(screen.getByLabelText("Display name"), "Jane Renamed");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mail/contacts/c1", expect.objectContaining({ method: "PUT" })));
        expect(await screen.findByRole("heading", { name: "Jane Renamed" })).toBeInTheDocument();
    });

    it("Cancel on the form returns to the detail view", async () => {
        mockShellAndContacts([jane]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByText("Jane Doe"));
        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
    });

    it("deleting a contact removes the selection and reloads the list", async () => {
        const fetchMock = mockShellAndContacts([jane, bob], (url, init) =>
            url === "/api/mail/contacts/c1?version=0" && init?.method === "DELETE" ? emptyResponse(200) : undefined,
        );
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByText("Jane Doe"));
        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith("/api/mail/contacts/c1?version=0", expect.objectContaining({ method: "DELETE" })),
        );
        expect(await screen.findByText("Select a contact, or create a new one.")).toBeInTheDocument();
    });

    it("shows an error message when deleting a contact fails", async () => {
        mockShellAndContacts([jane], (url, init) =>
            url === "/api/mail/contacts/c1?version=0" && init?.method === "DELETE" ? jsonResponse(500, { message: "delete failed" }) : undefined,
        );
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByText("Jane Doe"));
        await user.click(screen.getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("delete failed")).toBeInTheDocument();
    });

    it("shows a generic error message when deleting a contact fails with a non-API error", async () => {
        mockFetch((url, init) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [contactsFolder]);
            if (url.startsWith("/api/mail/contacts") && (init?.method ?? "GET") === "GET") return jsonResponse(200, [jane]);
            if (url === "/api/mail/contacts/c1?version=0" && init?.method === "DELETE") throw new TypeError("network down");
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByText("Jane Doe"));
        await user.click(screen.getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("Could not delete this contact.")).toBeInTheDocument();
    });

    it("adds and removes an email row", async () => {
        mockShellAndContacts([]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: "+ New contact" }));
        await user.click(screen.getByRole("button", { name: "+ Add email" }));
        await user.click(screen.getByRole("button", { name: "+ Add email" }));

        await user.type(screen.getByLabelText("Email address 1"), "first@example.com");
        await user.type(screen.getByLabelText("Email address 2"), "second@example.com");
        expect(screen.getByLabelText("Email address 1")).toHaveValue("first@example.com");
        expect(screen.getByLabelText("Email address 2")).toHaveValue("second@example.com");

        // Editing row 2 must leave row 1 untouched — exercises the "not this index" branch of the map.
        await user.selectOptions(screen.getByLabelText("Email type 2"), "home");
        expect(screen.getByLabelText("Email type 2")).toHaveValue("home");
        expect(screen.getByLabelText("Email address 1")).toHaveValue("first@example.com");

        await user.click(screen.getByRole("button", { name: "Remove email 1" }));
        expect(screen.queryByLabelText("Email address 2")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Email address 1")).toHaveValue("second@example.com");
    });

    it("adds and removes a phone row", async () => {
        mockShellAndContacts([]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: "+ New contact" }));
        await user.click(screen.getByRole("button", { name: "+ Add phone" }));
        await user.click(screen.getByRole("button", { name: "+ Add phone" }));

        await user.type(screen.getByLabelText("Phone number 1"), "555-1111");
        await user.type(screen.getByLabelText("Phone number 2"), "555-9999");
        expect(screen.getByLabelText("Phone number 1")).toHaveValue("555-1111");
        expect(screen.getByLabelText("Phone number 2")).toHaveValue("555-9999");

        // Editing row 2 must leave row 1 untouched — exercises the "not this index" branch of the map.
        await user.selectOptions(screen.getByLabelText("Phone type 2"), "other");
        expect(screen.getByLabelText("Phone type 2")).toHaveValue("other");
        expect(screen.getByLabelText("Phone number 1")).toHaveValue("555-1111");

        await user.click(screen.getByRole("button", { name: "Remove phone 1" }));
        expect(screen.queryByLabelText("Phone number 2")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Phone number 1")).toHaveValue("555-9999");
    });

    it("adds and removes an address", async () => {
        mockShellAndContacts([]);
        const user = userEvent.setup();
        render(<ContactsPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: "+ New contact" }));
        await user.click(screen.getByRole("button", { name: "+ Add address" }));

        const addressField = screen.getByText("Address").closest("div") as HTMLElement;
        await user.type(within(addressField).getByPlaceholderText("Street"), "1 Infinite Loop");
        expect(within(addressField).getByPlaceholderText("Street")).toHaveValue("1 Infinite Loop");
        await user.type(within(addressField).getByPlaceholderText("City"), "Cupertino");
        await user.type(within(addressField).getByPlaceholderText("State/Province"), "CA");
        await user.type(within(addressField).getByPlaceholderText("Postal code"), "95014");
        await user.type(within(addressField).getByPlaceholderText("Country"), "USA");
        expect(within(addressField).getByPlaceholderText("City")).toHaveValue("Cupertino");
        expect(within(addressField).getByPlaceholderText("State/Province")).toHaveValue("CA");
        expect(within(addressField).getByPlaceholderText("Postal code")).toHaveValue("95014");
        expect(within(addressField).getByPlaceholderText("Country")).toHaveValue("USA");

        await user.selectOptions(screen.getByLabelText("Address type"), "work");
        expect(screen.getByLabelText("Address type")).toHaveValue("work");

        await user.click(screen.getByRole("button", { name: "Remove address" }));
        expect(screen.queryByPlaceholderText("Street")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "+ Add address" })).toBeInTheDocument();
    });
});
