///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import type { AppDef, AppShellApp } from "./AppShell.js";

export interface BottomTabBarProps {
    apps: AppDef[];
    active: AppShellApp;
}

/**
 * The mobile counterpart to `AppShell`'s icon rail — same `apps` data (Mail/Calendar/Contacts/Tasks),
 * same full-page-nav `<a href>` links (this framework has no client-side router), just relocated to a
 * fixed bottom bar instead of a persistent left rail, which doesn't fit below the `md` breakpoint. Only
 * `AppShell` renders this (`md:hidden`, alongside the icon rail's `hidden md:flex`) — never both hidden
 * or both visible at once.
 */
export default function BottomTabBar({ apps, active }: BottomTabBarProps) {
    return (
        <nav
            aria-label="Mobile navigation"
            className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-surface border-t border-border flex items-stretch"
        >
            {apps.map(({ id, href, label, icon: Icon }) => (
                <a
                    key={id}
                    href={href}
                    aria-current={id === active ? "page" : undefined}
                    className={[
                        "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                        id === active ? "text-primary-dark" : "text-text-muted",
                    ].join(" ")}
                >
                    <Icon size={20} aria-hidden="true" />
                    {label}
                </a>
            ))}
        </nav>
    );
}
