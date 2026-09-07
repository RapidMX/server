///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { endOfWeek, isAfter, isBefore, isToday, startOfDay } from "date-fns";
import { ApiRequestError } from "../../shared/lib/api.js";
import { Task, TaskPriority, createTask, deleteTask, listTasks, setTaskCompleted } from "../../shared/lib/tasksApi.js";
import TasksShell, { TasksShellProps, useTasksShell } from "../../shared/components/tasks/layout/TasksShell.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";
import FormField from "../../shared/components/forms/FormField.js";

const INPUT_CLASS =
    "w-full text-sm py-2 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

export default function TasksPage(props: TasksShellProps) {
    return (
        <TasksShell {...props}>
            <TasksContent />
        </TasksShell>
    );
}

type Bucket = "Overdue" | "Today" | "This Week" | "Later" | "No due date";
const BUCKET_ORDER: Bucket[] = ["Overdue", "Today", "This Week", "Later", "No due date"];

/** Buckets a task by its due date relative to `now`, matching the Outlook/To-Do convention this list mirrors. */
function bucketFor(task: Task, now: Date): Bucket {
    if (!task.dueDate) {
        return "No due date";
    }
    const due = new Date(task.dueDate);
    if (isBefore(due, startOfDay(now))) {
        return "Overdue";
    }
    if (isToday(due)) {
        return "Today";
    }
    if (!isAfter(due, endOfWeek(now, { weekStartsOn: 1 }))) {
        return "This Week";
    }
    return "Later";
}

const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Low", normal: "Normal", high: "High" };
const PRIORITY_CLASS: Record<TaskPriority, string> = {
    low: "text-text-muted",
    normal: "text-text-muted",
    high: "text-danger",
};

function TasksContent() {
    const { folderUid, mailboxUid } = useTasksShell();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [title, setTitle] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [priority, setPriority] = useState<TaskPriority>("normal");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    function reload() {
        if (!folderUid) {
            setTasks([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        listTasks(folderUid, { limit: 500 })
            .then(setTasks)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load tasks."))
            .finally(() => setLoading(false));
    }

    useEffect(reload, [folderUid]);

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        setCreateError(null);
        if (!title.trim()) {
            setCreateError("A title is required.");
            return;
        }
        if (!mailboxUid || !folderUid) {
            return;
        }
        setCreating(true);
        try {
            const created = await createTask({
                mailboxUid,
                folderUid,
                title: title.trim(),
                dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
                priority,
            });
            setTasks((prev) => [...prev, created]);
            setTitle("");
            setDueDate("");
            setPriority("normal");
        } catch (err) {
            setCreateError(err instanceof ApiRequestError ? err.message : "Could not create this task.");
        } finally {
            setCreating(false);
        }
    }

    async function handleToggle(task: Task) {
        setActionError(null);
        const nextCompleted = !task.completed;
        setTasks((prev) => prev.map((t) => (t.uid === task.uid ? { ...t, completed: nextCompleted } : t)));
        try {
            const updated = await setTaskCompleted(task, nextCompleted);
            setTasks((prev) => prev.map((t) => (t.uid === task.uid ? updated : t)));
        } catch (err) {
            setTasks((prev) => prev.map((t) => (t.uid === task.uid ? task : t)));
            setActionError(err instanceof ApiRequestError ? err.message : "Could not update this task.");
        }
    }

    async function handleDelete(task: Task) {
        setActionError(null);
        try {
            await deleteTask(task.uid, task.version);
            setTasks((prev) => prev.filter((t) => t.uid !== task.uid));
        } catch (err) {
            setActionError(err instanceof ApiRequestError ? err.message : "Could not delete this task.");
        }
    }

    const grouped = useMemo(() => {
        const now = new Date();
        const map = new Map<Bucket, Task[]>(BUCKET_ORDER.map((b) => [b, []]));
        for (const task of tasks) {
            if (task.completed) {
                continue;
            }
            map.get(bucketFor(task, now))!.push(task);
        }
        return map;
    }, [tasks]);

    const completedTasks = tasks.filter((t) => t.completed);

    return (
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
                <h1 className="text-xl font-bold tracking-tight">Tasks</h1>

                {error && <Alert>{error}</Alert>}
                {actionError && <Alert>{actionError}</Alert>}

                <form onSubmit={handleCreate} className="bg-surface border border-border rounded-md p-4 flex flex-col gap-3">
                    <FormField label="New task" htmlFor="task-title">
                        <input
                            id="task-title"
                            type="text"
                            className={INPUT_CLASS}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Task title"
                        />
                    </FormField>
                    <div className="flex gap-3 items-end">
                        <FormField label="Due date" htmlFor="task-dueDate">
                            <input
                                id="task-dueDate"
                                type="date"
                                className={INPUT_CLASS}
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </FormField>
                        <FormField label="Priority" htmlFor="task-priority">
                            <select
                                id="task-priority"
                                className={INPUT_CLASS}
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                            >
                                <option value="low">Low</option>
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                            </select>
                        </FormField>
                        <Button type="submit" loading={creating} disabled={creating} className="!w-auto shrink-0">
                            Add task
                        </Button>
                    </div>
                    {createError && <Alert>{createError}</Alert>}
                </form>

                {loading ? (
                    <p className="text-sm text-text-muted">Loading&hellip;</p>
                ) : tasks.length === 0 ? (
                    <p className="text-sm text-text-muted">No tasks yet.</p>
                ) : (
                    <>
                        {BUCKET_ORDER.map((bucket) => {
                            const items = grouped.get(bucket)!;
                            if (items.length === 0) {
                                return null;
                            }
                            return (
                                <div key={bucket}>
                                    <TaskGroup label={bucket} tasks={items} onToggle={handleToggle} onDelete={handleDelete} />
                                </div>
                            );
                        })}
                        {completedTasks.length > 0 && (
                            <TaskGroup label="Completed" tasks={completedTasks} onToggle={handleToggle} onDelete={handleDelete} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

interface TaskGroupProps {
    label: string;
    tasks: Task[];
    onToggle: (task: Task) => void;
    onDelete: (task: Task) => void;
}

function TaskGroup({ label, tasks, onToggle, onDelete }: TaskGroupProps) {
    return (
        <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted mb-2">{label}</h2>
            <ul className="bg-surface border border-border rounded-md divide-y divide-border">
                {tasks.map((task) => (
                    <li key={task.uid} className="flex items-center gap-3 py-2.5 px-3">
                        <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => onToggle(task)}
                            aria-label={`Mark "${task.title}" as ${task.completed ? "not complete" : "complete"}`}
                        />
                        <span className={["flex-1 text-sm", task.completed ? "line-through text-text-muted" : ""].join(" ")}>
                            {task.title}
                        </span>
                        {task.priority !== "normal" && (
                            <span className={["text-xs font-medium", PRIORITY_CLASS[task.priority]].join(" ")}>
                                {PRIORITY_LABEL[task.priority]}
                            </span>
                        )}
                        {task.dueDate && (
                            <span className="text-xs text-text-muted shrink-0">{new Date(task.dueDate).toLocaleDateString()}</span>
                        )}
                        <button
                            type="button"
                            onClick={() => onDelete(task)}
                            aria-label={`Delete "${task.title}"`}
                            className="text-text-muted hover:text-danger text-sm px-1"
                        >
                            &times;
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
