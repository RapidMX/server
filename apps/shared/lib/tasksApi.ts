///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/** Typed wrappers over `@rapidmx/restapi`'s `/mail/tasks` REST surface — see `mailApi.ts`'s own header
 * comment for the shared ACL/authorization model every wrapper file here follows. */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type TaskPriority = "low" | "normal" | "high";

export interface Task {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    folderUid: string;
    title: string;
    body?: string;
    dueDate?: string;
    completed: boolean;
    priority: TaskPriority;
    reminderDate?: string;
}

/** Lists a folder's tasks, soonest due date first (tasks with no due date sort last). */
export function listTasks(folderUid: string, params: ListParams = {}): Promise<Task[]> {
    return apiFetch(`/mail/tasks?${buildQuery(params, { folderUid, sort: JSON.stringify({ dueDate: "ASC" }) })}`);
}

export interface CreateTaskInput {
    mailboxUid: string;
    folderUid: string;
    title: string;
    body?: string;
    dueDate?: string;
    priority?: TaskPriority;
    reminderDate?: string;
}

export function createTask(input: CreateTaskInput): Promise<Task> {
    return apiFetch("/mail/tasks", {
        method: "POST",
        body: JSON.stringify({ completed: false, priority: "normal", ...input }),
    });
}

export interface UpdateTaskInput {
    uid: string;
    version: number;
    title?: string;
    body?: string;
    dueDate?: string;
    completed?: boolean;
    priority?: TaskPriority;
    reminderDate?: string;
}

export function updateTask(input: UpdateTaskInput): Promise<Task> {
    return apiFetch(`/mail/tasks/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

/** Toggles a task's `completed` flag in place — same pattern as `mailApi.ts`'s `setMessageRead`. */
export function setTaskCompleted(task: Task, completed: boolean): Promise<Task> {
    return updateTask({ uid: task.uid, version: task.version, completed });
}

export function deleteTask(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/tasks/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
