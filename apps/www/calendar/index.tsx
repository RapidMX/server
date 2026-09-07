///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
    addDays,
    addMonths,
    addWeeks,
    eachDayOfInterval,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from "date-fns";
import { ApiRequestError } from "../../shared/lib/api.js";
import { CalendarEvent, listCalendarEvents } from "../../shared/lib/calendarApi.js";
import { moveOccurrence, resizeOccurrenceEnd } from "../../shared/lib/calendarMutations.js";
import { resolveDragAction } from "../../shared/lib/calendarDragIds.js";
import { CalendarOccurrence, expandAllOccurrences } from "../../shared/lib/recurrence.js";
import CalendarShell, { CalendarShellProps, useCalendarShell } from "../../shared/components/calendar/layout/CalendarShell.js";
import EventModal from "../../shared/components/calendar/EventModal.js";
import MonthView from "../../shared/components/calendar/MonthView.js";
import TimeGridView from "../../shared/components/calendar/TimeGridView.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";

export default function CalendarPage(props: CalendarShellProps) {
    return (
        <CalendarShell {...props}>
            <CalendarContent />
        </CalendarShell>
    );
}

type ViewType = "month" | "week" | "day";
const VIEW_TYPES: ViewType[] = ["month", "week", "day"];

interface ModalState {
    occurrence: CalendarOccurrence | null;
    initialStart?: Date;
    initialEnd?: Date;
}

function CalendarContent() {
    const { mailboxUid, folderUid, mailboxes } = useCalendarShell();
    // `CalendarShell` only ever renders this component once `mailboxUid` is set, and always to a value
    // drawn from `mailboxes` itself (see its own resolution logic) — the lookup below always succeeds.
    const organizerAddress = mailboxes.find((mb) => mb.uid === mailboxUid)!.primarySmtpAddress;
    const sensors = useSensors(useSensor(PointerSensor));

    const [view, setView] = useState<ViewType>("month");
    const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [modal, setModal] = useState<ModalState | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const requestedView = params.get("view");
        if ((VIEW_TYPES as string[]).includes(requestedView ?? "")) {
            setView(requestedView as ViewType);
        }
        const requestedDate = params.get("date");
        const parsedDate = requestedDate ? new Date(requestedDate) : null;
        if (parsedDate && !isNaN(parsedDate.getTime())) {
            setViewDate(startOfDay(parsedDate));
        }
    }, []);

    const { rangeStart, rangeEnd, days } = useMemo(() => {
        if (view === "month") {
            const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
            const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
            return { rangeStart: start, rangeEnd: end, days: [] as Date[] };
        }
        if (view === "week") {
            const start = startOfWeek(viewDate, { weekStartsOn: 1 });
            const end = endOfWeek(viewDate, { weekStartsOn: 1 });
            return { rangeStart: start, rangeEnd: end, days: eachDayOfInterval({ start, end }) };
        }
        const start = startOfDay(viewDate);
        const end = endOfDay(viewDate);
        return { rangeStart: start, rangeEnd: end, days: [start] };
    }, [view, viewDate]);

    function reload() {
        if (!folderUid) {
            setEvents([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        listCalendarEvents(folderUid)
            .then(setEvents)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load your calendar."))
            .finally(() => setLoading(false));
    }

    useEffect(reload, [folderUid]);

    const occurrences = useMemo(
        () => expandAllOccurrences(events, rangeStart, rangeEnd),
        [events, rangeStart, rangeEnd],
    );

    function shiftView(direction: 1 | -1) {
        setViewDate((d) => (view === "month" ? addMonths(d, direction) : view === "week" ? addWeeks(d, direction) : addDays(d, direction)));
    }

    function goToday() {
        setViewDate(startOfDay(new Date()));
    }

    function handleSelectDay(date: Date) {
        setView("day");
        setViewDate(startOfDay(date));
    }

    function openNewEvent(start?: Date, end?: Date) {
        if (!mailboxUid || !folderUid) {
            return;
        }
        setModal({ occurrence: null, initialStart: start ?? new Date(), initialEnd: end ?? new Date(Date.now() + 30 * 60_000) });
    }

    function openEvent(occurrence: CalendarOccurrence) {
        setModal({ occurrence });
    }

    function closeModal() {
        setModal(null);
    }

    function handleSaved() {
        setModal(null);
        reload();
    }

    function handleDeleted() {
        setModal(null);
        reload();
    }

    async function handleDragEnd(event: DragEndEvent) {
        const overId = event.over ? String(event.over.id) : undefined;
        const action = resolveDragAction(String(event.active.id), overId, occurrences);
        if (!action) {
            return;
        }
        setActionError(null);
        try {
            if (action.type === "move") {
                await moveOccurrence(action.occurrence, action.deltaMs);
            } else {
                await resizeOccurrenceEnd(action.occurrence, action.newEnd);
            }
            reload();
        } catch (err) {
            setActionError(err instanceof ApiRequestError ? err.message : "Could not update this event.");
        }
    }

    const title =
        view === "month"
            ? format(viewDate, "MMMM yyyy")
            : view === "week"
              ? `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}`
              : format(viewDate, "EEEE, MMMM d, yyyy");

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 p-3 border-b border-border shrink-0">
                <Button type="button" onClick={() => openNewEvent()} className="!w-auto shrink-0">
                    + New event
                </Button>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => shiftView(-1)} aria-label="Previous" className="w-7 h-7 text-sm rounded-sm hover:bg-surface-alt">
                        &lsaquo;
                    </button>
                    <button type="button" onClick={goToday} className="px-2 h-7 text-sm rounded-sm hover:bg-surface-alt">
                        Today
                    </button>
                    <button type="button" onClick={() => shiftView(1)} aria-label="Next" className="w-7 h-7 text-sm rounded-sm hover:bg-surface-alt">
                        &rsaquo;
                    </button>
                </div>
                <h1 className="text-lg font-bold tracking-tight">{title}</h1>
                <div className="ml-auto flex gap-1">
                    {VIEW_TYPES.map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setView(v)}
                            className={[
                                "px-3 h-7 text-sm rounded-sm capitalize",
                                view === v ? "bg-primary text-white" : "hover:bg-surface-alt",
                            ].join(" ")}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="p-3">
                    <Alert>{error}</Alert>
                </div>
            )}
            {actionError && (
                <div className="p-3">
                    <Alert>{actionError}</Alert>
                </div>
            )}

            {loading ? (
                <p className="p-4 text-sm text-text-muted">Loading&hellip;</p>
            ) : (
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    {view === "month" ? (
                        <MonthView viewDate={viewDate} occurrences={occurrences} onSelectDay={handleSelectDay} onSelectEvent={openEvent} />
                    ) : (
                        <TimeGridView days={days} occurrences={occurrences} onSelectEvent={openEvent} onSelectSlot={openNewEvent} />
                    )}
                </DndContext>
            )}

            {/* `mailboxUid`/`folderUid` are guaranteed defined whenever `modal` is: `openNewEvent` only sets it
                after checking both, and `openEvent` only fires from an occurrence that itself required a
                successful, folder-scoped load to render. */}
            {modal && (
                <EventModal
                    open
                    onClose={closeModal}
                    mailboxUid={mailboxUid!}
                    folderUid={folderUid!}
                    organizerAddress={organizerAddress}
                    occurrence={modal.occurrence}
                    initialStart={modal.initialStart}
                    initialEnd={modal.initialEnd}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                />
            )}
        </div>
    );
}
