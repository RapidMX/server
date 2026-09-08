///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useState } from "react";
import { ApiRequestError } from "../../lib/api.js";
import {
    Attendee,
    AttendeeRole,
    BusyStatus,
    CalendarEventInput,
    RecurrenceRule,
    createCalendarEvent,
    updateCalendarEvent,
} from "../../lib/calendarApi.js";
import { deleteEventOccurrence, deleteEventSeries, detachOccurrence, saveEventSeries } from "../../lib/calendarMutations.js";
import { CalendarOccurrence } from "../../lib/recurrence.js";
import Modal from "../../lib/Modal.js";
import Alert from "../feedback/Alert.js";
import Button from "../buttons/Button.js";
import FormField from "../forms/FormField.js";
import RecurrenceEditor from "./RecurrenceEditor.js";

const INPUT_CLASS =
    "w-full text-sm py-2 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";
const SELECT_CLASS =
    "text-sm py-2 px-2 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

const ATTENDEE_ROLES: AttendeeRole[] = ["required", "optional", "resource"];
const BUSY_STATUSES: BusyStatus[] = ["busy", "free", "tentative", "oof"];
const BUSY_STATUS_LABEL: Record<BusyStatus, string> = { busy: "Busy", free: "Free", tentative: "Tentative", oof: "Out of office" };

/** `<input type="datetime-local">` reads/writes local time with no timezone suffix — `new Date(str)`
 * parses that as the browser's own local time, matching what the picker visually showed the user. */
function toDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

export interface EventModalProps {
    open: boolean;
    onClose: () => void;
    mailboxUid: string;
    /** The calendar folder a new event is created into (ignored when editing — an existing event keeps
     * its own `folderUid`). When `calendars` names more than one option, a "Calendar" selector lets the
     * user override this default before saving. */
    folderUid: string;
    /** Every calendar the caller could create this event into. Omitted, or a single entry, means "only
     * one calendar exists" — no selector is shown and `folderUid` is used as-is, matching this
     * component's original single-calendar behavior exactly. */
    calendars?: { uid: string; name: string }[];
    organizerAddress: string;
    /** `null` when creating a new event. */
    occurrence: CalendarOccurrence | null;
    /** Prefilled start/end for create mode (e.g. the day/slot the user clicked). */
    initialStart?: Date;
    initialEnd?: Date;
    onSaved: () => void;
    onDeleted: () => void;
}

type EditScope = "occurrence" | "series";

/**
 * Create/view/edit/delete for a single calendar event. Editing or deleting a recurring event's
 * occurrence offers a choice between "this event" and "the entire series" (see
 * `calendarMutations.ts`) — Outlook's own convention for the same ambiguity.
 */
export default function EventModal({
    open,
    onClose,
    mailboxUid,
    folderUid,
    calendars,
    organizerAddress,
    occurrence,
    initialStart,
    initialEnd,
    onSaved,
    onDeleted,
}: EventModalProps) {
    const [targetFolderUid, setTargetFolderUid] = useState(folderUid);
    const [title, setTitle] = useState(occurrence?.title ?? "");
    const [location, setLocation] = useState(occurrence?.location ?? "");
    const [start, setStart] = useState(toDatetimeLocal(occurrence?.startDate ?? initialStart?.toISOString() ?? new Date().toISOString()));
    const [end, setEnd] = useState(
        toDatetimeLocal(occurrence?.endDate ?? initialEnd?.toISOString() ?? new Date(Date.now() + 30 * 60_000).toISOString()),
    );
    const [allDay, setAllDay] = useState(occurrence?.allDay ?? false);
    const [timezone] = useState(occurrence?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [attendees, setAttendees] = useState<Attendee[]>(occurrence?.attendees ?? []);
    const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(occurrence?.recurrenceRule ?? null);
    const [reminderMinutes, setReminderMinutes] = useState(occurrence?.reminderMinutesBeforeStart?.toString() ?? "");
    const [busyStatus, setBusyStatus] = useState<BusyStatus>(occurrence?.busyStatus ?? "busy");
    const [editScope, setEditScope] = useState<EditScope>("occurrence");
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    function updateAttendee(index: number, patch: Partial<Attendee>) {
        setAttendees((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
    }
    function removeAttendee(index: number) {
        setAttendees((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (!title.trim()) {
            setError("A title is required.");
            return;
        }
        if (new Date(end) <= new Date(start)) {
            setError("The end time must be after the start time.");
            return;
        }

        const fields: Partial<CalendarEventInput> = {
            title: title.trim(),
            location: location.trim() || undefined,
            startDate: new Date(start).toISOString(),
            endDate: new Date(end).toISOString(),
            allDay,
            timezone,
            organizer: { address: organizerAddress, type: "to" },
            attendees,
            recurrenceRule: recurrenceRule ?? undefined,
            reminderMinutesBeforeStart: reminderMinutes.trim() ? Number(reminderMinutes) : undefined,
            busyStatus,
        };

        setSaving(true);
        try {
            if (!occurrence) {
                await createCalendarEvent({ mailboxUid, folderUid: targetFolderUid, ...fields } as CalendarEventInput);
            } else if (occurrence.isRecurringOccurrence && editScope === "occurrence") {
                await detachOccurrence(occurrence, fields);
            } else if (occurrence.isRecurringOccurrence) {
                await saveEventSeries(occurrence, fields);
            } else {
                await updateCalendarEvent({ uid: occurrence.uid, version: occurrence.version, ...fields });
            }
            onSaved();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save this event.");
        } finally {
            setSaving(false);
        }
    }

    // Only ever invoked from the Delete button(s) rendered inside the `{occurrence && (...)}` block
    // below, so `occurrence` is always non-null here — no defensive null check needed.
    async function handleDelete(scope: EditScope) {
        setError(null);
        setSaving(true);
        try {
            if (occurrence!.isRecurringOccurrence && scope === "occurrence") {
                await deleteEventOccurrence(occurrence!);
            } else {
                await deleteEventSeries(occurrence!);
            }
            onDeleted();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not delete this event.");
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title={occurrence ? "Edit event" : "New event"}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-1">
                {error && <Alert>{error}</Alert>}

                {!occurrence && calendars && calendars.length > 1 && (
                    <FormField label="Calendar" htmlFor="event-calendar">
                        <select
                            id="event-calendar"
                            className={INPUT_CLASS}
                            value={targetFolderUid}
                            onChange={(e) => setTargetFolderUid(e.target.value)}
                        >
                            {calendars.map((cal) => (
                                <option key={cal.uid} value={cal.uid}>
                                    {cal.name}
                                </option>
                            ))}
                        </select>
                    </FormField>
                )}

                <FormField label="Title" htmlFor="event-title">
                    <input id="event-title" type="text" className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} />
                </FormField>

                <FormField label="Location" htmlFor="event-location">
                    <input id="event-location" type="text" className={INPUT_CLASS} value={location} onChange={(e) => setLocation(e.target.value)} />
                </FormField>

                <label className="flex items-center gap-2 text-sm font-medium mb-3">
                    <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                    All day
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Start" htmlFor="event-start">
                        <input
                            id="event-start"
                            type={allDay ? "date" : "datetime-local"}
                            className={INPUT_CLASS}
                            value={allDay ? start.slice(0, 10) : start}
                            onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)}
                        />
                    </FormField>
                    <FormField label="End" htmlFor="event-end">
                        <input
                            id="event-end"
                            type={allDay ? "date" : "datetime-local"}
                            className={INPUT_CLASS}
                            value={allDay ? end.slice(0, 10) : end}
                            onChange={(e) => setEnd(allDay ? `${e.target.value}T00:00` : e.target.value)}
                        />
                    </FormField>
                </div>

                <FormField label="Attendees" htmlFor="event-attendees">
                    <div id="event-attendees" className="flex flex-col gap-2">
                        {attendees.map((attendee, i) => (
                            <div key={i} className="flex gap-2">
                                <input
                                    type="email"
                                    className={`${INPUT_CLASS} flex-1`}
                                    value={attendee.address}
                                    onChange={(e) => updateAttendee(i, { address: e.target.value })}
                                    aria-label={`Attendee email ${i + 1}`}
                                />
                                <select
                                    className={SELECT_CLASS}
                                    value={attendee.role}
                                    onChange={(e) => updateAttendee(i, { role: e.target.value as AttendeeRole })}
                                    aria-label={`Attendee role ${i + 1}`}
                                >
                                    {ATTENDEE_ROLES.map((role) => (
                                        <option key={role} value={role}>
                                            {role}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => removeAttendee(i)}
                                    className="text-sm text-danger px-2"
                                    aria-label={`Remove attendee ${i + 1}`}
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => setAttendees((prev) => [...prev, { address: "", role: "required", responseStatus: "needsAction", isOrganizer: false }])}
                            className="self-start text-xs font-medium text-primary-dark hover:underline"
                        >
                            + Add attendee
                        </button>
                    </div>
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Busy status" htmlFor="event-busyStatus">
                        <select
                            id="event-busyStatus"
                            className={INPUT_CLASS}
                            value={busyStatus}
                            onChange={(e) => setBusyStatus(e.target.value as BusyStatus)}
                        >
                            {BUSY_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                    {BUSY_STATUS_LABEL[status]}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Reminder (minutes before)" htmlFor="event-reminder">
                        <input
                            id="event-reminder"
                            type="number"
                            min={0}
                            className={INPUT_CLASS}
                            value={reminderMinutes}
                            onChange={(e) => setReminderMinutes(e.target.value)}
                            placeholder="None"
                        />
                    </FormField>
                </div>

                <FormField label="Recurrence" htmlFor="event-recurrence">
                    <RecurrenceEditor value={recurrenceRule} onChange={setRecurrenceRule} />
                </FormField>

                {occurrence?.isRecurringOccurrence && (
                    <fieldset className="flex flex-col gap-1.5 text-sm mb-3">
                        <legend className="text-xs font-bold uppercase tracking-wide text-text-muted mb-1">Apply changes to</legend>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="event-edit-scope"
                                checked={editScope === "occurrence"}
                                onChange={() => setEditScope("occurrence")}
                            />
                            This event only
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="event-edit-scope"
                                checked={editScope === "series"}
                                onChange={() => setEditScope("series")}
                            />
                            The entire series
                        </label>
                    </fieldset>
                )}

                <div className="flex gap-3 mt-2">
                    <Button type="submit" loading={saving} disabled={saving} className="!w-auto">
                        Save
                    </Button>
                    <Button type="button" variant="secondary" className="!w-auto" onClick={onClose}>
                        Cancel
                    </Button>
                    {occurrence &&
                        (!occurrence.isRecurringOccurrence ? (
                            <Button
                                type="button"
                                variant="secondary"
                                className="!w-auto ml-auto text-danger"
                                disabled={saving}
                                onClick={() => handleDelete("series")}
                            >
                                Delete
                            </Button>
                        ) : !confirmingDelete ? (
                            <Button
                                type="button"
                                variant="secondary"
                                className="!w-auto ml-auto text-danger"
                                disabled={saving}
                                onClick={() => setConfirmingDelete(true)}
                            >
                                Delete
                            </Button>
                        ) : (
                            <div className="flex gap-2 ml-auto">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="!w-auto text-danger"
                                    disabled={saving}
                                    onClick={() => handleDelete("occurrence")}
                                >
                                    Delete this event
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="!w-auto text-danger"
                                    disabled={saving}
                                    onClick={() => handleDelete("series")}
                                >
                                    Delete series
                                </Button>
                            </div>
                        ))}
                </div>
            </form>
        </Modal>
    );
}
