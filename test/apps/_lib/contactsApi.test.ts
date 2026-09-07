// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import {
    createContact,
    deleteContact,
    getContact,
    listContacts,
    updateContact,
} from "../../../apps/shared/lib/contactsApi.js";

const contact = {
    uid: "c1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    folderUid: "f1",
    displayName: "Jane Doe",
    emails: [{ address: "jane@example.com", type: "work" as const }],
    phones: [],
    addresses: [],
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listContacts", () => {
    it("fetches scoped by folderUid, sorted by display name, with default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [contact]));
        const result = await listContacts("f1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/contacts?limit=25&page=0&folderUid=f1&sort=" + encodeURIComponent(JSON.stringify({ displayName: "ASC" })),
            expect.anything(),
        );
        expect(result).toEqual([contact]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listContacts("f1", { page: 2, limit: 10 });
        expect(fetchMock.mock.calls[0][0]).toContain("limit=10&page=2");
    });
});

describe("getContact", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, contact));
        const result = await getContact("c/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/contacts/c%2F1", expect.anything());
        expect(result).toEqual(contact);
    });
});

describe("createContact", () => {
    it("posts the input with empty-array defaults for emails/phones/addresses", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, contact));
        await createContact({ mailboxUid: "mb1", folderUid: "f1", displayName: "Jane Doe" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/contacts",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    emails: [],
                    phones: [],
                    addresses: [],
                    mailboxUid: "mb1",
                    folderUid: "f1",
                    displayName: "Jane Doe",
                }),
            }),
        );
    });

    it("forwards explicit emails/phones/addresses instead of defaulting them", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, contact));
        await createContact({
            mailboxUid: "mb1",
            folderUid: "f1",
            displayName: "Jane Doe",
            emails: [{ address: "jane@example.com", type: "work" }],
        });
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.emails).toEqual([{ address: "jane@example.com", type: "work" }]);
    });
});

describe("updateContact", () => {
    it("PUTs the encoded uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...contact, displayName: "Renamed" }));
        const result = await updateContact({
            uid: "c/1",
            version: 0,
            mailboxUid: "mb1",
            folderUid: "f1",
            displayName: "Renamed",
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/contacts/c%2F1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    uid: "c/1",
                    version: 0,
                    mailboxUid: "mb1",
                    folderUid: "f1",
                    displayName: "Renamed",
                }),
            }),
        );
        expect(result.displayName).toBe("Renamed");
    });
});

describe("deleteContact", () => {
    it("DELETEs the encoded uid with the version query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteContact("c/1", 3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/contacts/c%2F1?version=3",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});
