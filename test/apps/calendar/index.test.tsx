// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import CalendarPage from "../../../apps/www/calendar/index.js";

// `@dnd-kit/core`'s real `PointerSensor` can't be driven from jsdom (it calls `setPointerCapture`,
// which jsdom doesn't implement, and that breaks the rest of synthetic event dispatch — see
// `MonthView.test.tsx`'s identical note). This page wires a real `PointerSensor` for production drag
// support, so plain-click tests here neutralize it the same way: `useSensors` is forced to return no
// active sensors, leaving `DndContext`/`useDraggable`/`useDroppable` themselves real so the grids
// still render normally.
vi.mock("@dnd-kit/core", async () => {
    const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
    return { ...actual, useSensors: () => [] };
});

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
const calendarFolder = {
    uid: "f-cal",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    name: "Calendar",
    type: "calendar" as const,
    unreadCount: 0,
    totalCount: 0,
};

function calendarEvent(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        uid: "e1",
        version: 0,
        dateCreated: "2026-01-01T00:00:00.000Z",
        dateModified: "2026-01-01T00:00:00.000Z",
        mailboxUid: "mb1",
        folderUid: "f-cal",
        title: "Standup",
        startDate: "2026-06-15T15:00:00.000Z",
        endDate: "2026-06-15T15:30:00.000Z",
        allDay: false,
        timezone: "UTC",
        organizer: { address: "u1@example.com", type: "to" as const },
        attendees: [],
        status: "confirmed" as const,
        busyStatus: "busy" as const,
        icalUid: "abc",
        sequence: 0,
        ...overrides,
    };
}

function mockShellAndEvents(
    events: unknown[],
    extra?: (url: string, init?: RequestInit) => Response | undefined,
    folders: unknown[] = [calendarFolder],
) {
    return mockFetch((url, init) => {
        const custom = extra?.(url, init);
        if (custom) return custom;
        if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
        if (url.startsWith("/api/mail/folders")) return jsonResponse(200, folders);
        if (url.startsWith("/api/mail/calendar-events") && (init?.method ?? "GET") === "GET") return jsonResponse(200, events);
        throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
    });
}

// A pinned Monday (matches `tasks/index.test.tsx`'s own note on why Monday is chosen: every bucket/
// range this suite checks has a valid value from a week-start day). Read once on mount via `?date=`.
beforeEach(() => {
    window.history.pushState(null, "", "/calendar?date=2026-06-15&view=month");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.history.pushState(null, "", "/");
});

describe("CalendarPage", () => {
    it("shows the visible month's events and title", async () => {
        mockShellAndEvents([calendarEvent()]);
        render(<CalendarPage userUid="u1" />);

        expect(await screen.findByText(/Standup/)).toBeInTheDocument();
        expect(screen.getByText("June 2026")).toBeInTheDocument();
    });

    it("defaults to Month view on the real current date when the URL has no ?view=/?date=", async () => {
        window.history.pushState(null, "", "/calendar");
        mockShellAndEvents([]);
        render(<CalendarPage userUid="u1" />);

        expect(await screen.findByText(format(new Date(), "MMMM yyyy"))).toBeInTheDocument();
    });

    it("shows an API error message when loading events fails", async () => {
        mockShellAndEvents([], (url, init) =>
            url.startsWith("/api/mail/calendar-events") && (init?.method ?? "GET") === "GET"
                ? jsonResponse(500, { message: "boom" })
                : undefined,
        );
        render(<CalendarPage userUid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when loading events fails with a non-API error", async () => {
        mockFetch((url) => {
            if (url.startsWith("/api/mail/mailboxes")) return jsonResponse(200, [mailbox]);
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [calendarFolder]);
            throw new TypeError("network down");
        });
        render(<CalendarPage userUid="u1" />);
        expect(await screen.findByText("Could not load your calendar.")).toBeInTheDocument();
    });

    it("clears events (not stuck loading) and ignores 'New event' when the mailbox has no calendar folder yet", async () => {
        mockShellAndEvents([], undefined, []);
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);

        expect(await screen.findByText("June 2026")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "+ New event" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("switches between Month, Week, and Day views, updating the title and grid", async () => {
        mockShellAndEvents([]);
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);
        await screen.findByText("June 2026");

        await user.click(screen.getByRole("button", { name: "week" }));
        expect(screen.getByText("Jun 15 – Jun 21, 2026")).toBeInTheDocument();
        expect(screen.getByText("1AM")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "day" }));
        expect(screen.getByText("Monday, June 15, 2026")).toBeInTheDocument();
    });

    it("Previous/Next shift the visible range according to the current view", async () => {
        mockShellAndEvents([]);
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);
        await screen.findByText("June 2026");

        await user.click(screen.getByRole("button", { name: "Previous" }));
        expect(screen.getByText("May 2026")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByText("June 2026")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "week" }));
        await user.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByText("Jun 22 – Jun 28, 2026")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "day" }));
        await user.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByText("Tuesday, June 23, 2026")).toBeInTheDocument();
    });

    it("Today jumps back to the real current date (fake-clocked, no userEvent — see tasks/index.test.tsx's note)", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
        mockShellAndEvents([]);
        render(<CalendarPage userUid="u1" />);
        await waitFor(() => expect(screen.getByText("June 2026")).toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: "Today" }));
        await waitFor(() => expect(screen.getByText("July 2026")).toBeInTheDocument());
    });

    it("clicking a day in Month view jumps to Day view for that date", async () => {
        mockShellAndEvents([]);
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);
        await screen.findByText("June 2026");

        await user.click(screen.getByRole("button", { name: "15" }));
        expect(screen.getByText("Monday, June 15, 2026")).toBeInTheDocument();
    });

    it("clicking an event opens the edit modal, and Cancel closes it without saving", async () => {
        mockShellAndEvents([calendarEvent()]);
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: /Standup/ }));
        expect(screen.getByRole("dialog", { name: "Edit event" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("'+ New event' opens a blank create modal (no prefilled start/end) and saves it", async () => {
        const created = calendarEvent({ uid: "e-new", title: "Planning" });
        const fetchMock = mockShellAndEvents([], (url, init) =>
            url === "/api/mail/calendar-events" && init?.method === "POST" ? jsonResponse(200, created) : undefined,
        );
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);
        await screen.findByText("June 2026");

        await user.click(screen.getByRole("button", { name: "+ New event" }));
        expect(screen.getByRole("dialog", { name: "New event" })).toBeInTheDocument();
        await user.type(screen.getByLabelText("Title"), "Planning");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith("/api/mail/calendar-events", expect.objectContaining({ method: "POST" })),
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("clicking an empty slot in Week view opens a create modal prefilled with that slot", async () => {
        mockShellAndEvents([]);
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);
        await screen.findByText("June 2026");
        await user.click(screen.getByRole("button", { name: "week" }));

        await user.click(screen.getByLabelText("New event at 9:00 AM, Jun 15"));
        expect(screen.getByRole("dialog", { name: "New event" })).toBeInTheDocument();
    });

    it("deleting an event from the edit modal reloads the list", async () => {
        const fetchMock = mockShellAndEvents([calendarEvent()], (url, init) =>
            url === "/api/mail/calendar-events/e1?version=0" && init?.method === "DELETE" ? emptyResponse(200) : undefined,
        );
        const user = userEvent.setup();
        render(<CalendarPage userUid="u1" />);

        await user.click(await screen.findByRole("button", { name: /Standup/ }));
        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/mail/calendar-events/e1?version=0",
                expect.objectContaining({ method: "DELETE" }),
            ),
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});
