///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/** Typed wrappers over `@rapidmx/restapi`'s `/mail/calendar-events` REST surface — see `mailApi.ts`'s own
 * header comment for the shared ACL/authorization model every wrapper file here follows. Recurrence
 * expansion happens entirely client-side (see `apps/shared/lib/recurrence.ts`) — the backend stores/returns
 * `RecurrenceRule` as-is and does no RFC5545 expansion of its own. */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type AttendeeRole = "required" | "optional" | "resource";
export type AttendeeResponseStatus = "needsAction" | "accepted" | "declined" | "tentative";

export interface Attendee {
    address: string;
    displayName?: string;
    role: AttendeeRole;
    responseStatus: AttendeeResponseStatus;
    isOrganizer: boolean;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** RFC5545 two-letter weekday codes, matching `rrule`'s own `WeekdayStr` type exactly. */
export type WeekdayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface RecurrenceRule {
    freq: RecurrenceFrequency;
    interval: number;
    /** Only meaningful for `freq: "weekly"`. */
    byDay?: WeekdayCode[];
    byMonthDay?: number[];
    byMonth?: number[];
    /** Ends after this many occurrences. Mutually exclusive with `until` — at most one may be set. */
    count?: number;
    /** Ends on this date (inclusive). Mutually exclusive with `count`. */
    until?: string;
    /** Specific occurrence start dates removed from the recurrence set. */
    exceptions: string[];
}

export type CalendarEventStatus = "tentative" | "confirmed" | "cancelled";
export type BusyStatus = "free" | "busy" | "tentative" | "oof";

/**
 * The organizer's shape is `@rapidmx/restapi`'s general-purpose `Recipient` type (it's reused from the
 * mail-recipient model), so it requires a `type` field even though a to/cc/bcc distinction is meaningless
 * for an event organizer — this wrapper always sends `type: "to"` as an inert filler value when building one.
 */
export interface CalendarOrganizer {
    address: string;
    displayName?: string;
    type: "to";
}

export interface CalendarEvent {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    folderUid: string;
    mailboxUid: string;
    title: string;
    location?: string;
    startDate: string;
    endDate: string;
    allDay: boolean;
    timezone: string;
    organizer: CalendarOrganizer;
    attendees: Attendee[];
    recurrenceRule?: RecurrenceRule;
    /** For a single occurrence of a recurring event that has been individually modified, its original start date. */
    recurrenceId?: string;
    status: CalendarEventStatus;
    busyStatus: BusyStatus;
    reminderMinutesBeforeStart?: number;
    icalUid: string;
    sequence: number;
}

/**
 * Lists every event in a folder (same "fetch the flat list, filter client-side" contract as
 * `contactsApi.ts`'s `listContacts`/`tasksApi.ts`'s `listTasks`), for the caller to expand and filter
 * to a visible range itself (see `recurrence.ts`'s `expandAllOccurrences`). This deliberately does
 * *not* push `startDate`/`endDate` range filtering down to the server via `@rapidmx/restapi`'s
 * `field=lte(v)`/`gte(v)` query-operator DSL — confirmed directly against a running instance that
 * `CalendarEventMongo`'s `startDate`/`endDate` are persisted as plain strings despite being typed
 * `Date`, so a Mongo `$lte`/`$gte` comparison against them (a real `Date` operand) matches nothing at
 * all, silently returning zero events for *any* date-bounded query. Client-side filtering sidesteps
 * that entirely and needs no fix to land here.
 */
export function listCalendarEvents(folderUid: string): Promise<CalendarEvent[]> {
    return apiFetch(`/mail/calendar-events?${buildQuery({ limit: 500 }, { folderUid })}`);
}

export function getCalendarEvent(uid: string): Promise<CalendarEvent> {
    return apiFetch(`/mail/calendar-events/${encodeURIComponent(uid)}`);
}

export interface CalendarEventInput {
    mailboxUid: string;
    folderUid: string;
    title: string;
    location?: string;
    startDate: string;
    endDate: string;
    allDay?: boolean;
    timezone: string;
    organizer: CalendarOrganizer;
    attendees?: Attendee[];
    recurrenceRule?: RecurrenceRule;
    status?: CalendarEventStatus;
    busyStatus?: BusyStatus;
    reminderMinutesBeforeStart?: number;
}

export function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    return apiFetch("/mail/calendar-events", {
        method: "POST",
        body: JSON.stringify({
            allDay: false,
            attendees: [],
            status: "confirmed",
            busyStatus: "busy",
            icalUid: crypto.randomUUID(),
            sequence: 0,
            ...input,
        }),
    });
}

export interface UpdateCalendarEventInput extends Partial<CalendarEventInput> {
    uid: string;
    version: number;
}

export function updateCalendarEvent(input: UpdateCalendarEventInput): Promise<CalendarEvent> {
    return apiFetch(`/mail/calendar-events/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteCalendarEvent(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/calendar-events/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
