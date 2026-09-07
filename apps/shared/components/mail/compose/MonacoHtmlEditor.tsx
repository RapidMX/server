///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";

export interface MonacoHtmlEditorProps {
    value: string;
    onChange: (value: string) => void;
    height?: string;
}

/**
 * A thin wrapper around Monaco Editor configured for HTML source editing — the compose page's rich-body
 * editor (`apps/www/compose`). `value` seeds the editor's initial content only; live edits flow out via
 * `onChange`, never back in — Monaco owns its own text buffer once mounted, the same way any other
 * self-contained third-party editor widget would.
 *
 * Deliberately runs with no `self.MonacoEnvironment`/web-worker configuration: Monaco falls back to running
 * its tokenizer/language logic on the main thread when none is set (a one-time console warning, no loss of
 * basic editing/highlighting) — fine for plain HTML source editing, which needs none of the semantic
 * diagnostics workers exist for. This also sidesteps bundling Monaco's worker files through this project's
 * plain `@vitejs/plugin-react` Vite config, which has no dedicated worker-output handling configured.
 *
 * `monaco-editor` itself is loaded via a dynamic `import()` inside `useEffect` — never at module load time —
 * since it assumes a browser the instant its module executes, and this component's module is also imported
 * by the SSR render of `apps/www/compose` (`ReactRoute` renders every page server-side under Node first,
 * before hydration takes over).
 */
export default function MonacoHtmlEditor({ value, onChange, height = "360px" }: MonacoHtmlEditorProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        let disposed = false;
        let editor: Monaco.editor.IStandaloneCodeEditor | undefined;

        void import("monaco-editor").then((monaco) => {
            if (disposed || !containerRef.current) {
                return;
            }
            editor = monaco.editor.create(containerRef.current, {
                value,
                language: "html",
                automaticLayout: true,
                minimap: { enabled: false },
                wordWrap: "on",
            });
            editor.onDidChangeModelContent(() => {
                onChangeRef.current(editor!.getValue());
            });
        });

        return () => {
            disposed = true;
            editor?.dispose();
        };
        // `value` seeds the initial buffer only — see the doc comment above for why this never re-syncs.
    }, []);

    return <div ref={containerRef} style={{ height }} className="border border-border rounded-sm" />;
}
