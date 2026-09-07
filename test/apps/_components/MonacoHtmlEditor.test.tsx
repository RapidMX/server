// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as monaco from "monaco-editor";
import MonacoHtmlEditor from "../../../apps/shared/components/mail/compose/MonacoHtmlEditor.js";

vi.mock("monaco-editor", () => ({ editor: { create: vi.fn() } }));

/** Builds a minimal fake `IStandaloneCodeEditor` — just enough surface for `MonacoHtmlEditor` to drive. */
function fakeEditor(initialValue: string) {
    let value = initialValue;
    let changeListener: (() => void) | undefined;
    return {
        getValue: () => value,
        setValue: (v: string) => {
            value = v;
            changeListener?.();
        },
        onDidChangeModelContent: (cb: () => void) => {
            changeListener = cb;
        },
        dispose: vi.fn(),
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("MonacoHtmlEditor", () => {
    it("creates the editor against its container with the initial value, and reports edits via onChange", async () => {
        const editor = fakeEditor("<p>seed</p>");
        (monaco.editor.create as any).mockImplementation((container: HTMLElement, options: any) => {
            expect(container).toBeInstanceOf(HTMLDivElement);
            expect(options.value).toBe("<p>seed</p>");
            expect(options.language).toBe("html");
            return editor;
        });
        const onChange = vi.fn();
        const { container } = render(<MonacoHtmlEditor value="<p>seed</p>" onChange={onChange} />);

        await vi.waitFor(() => expect(monaco.editor.create).toHaveBeenCalledTimes(1));
        expect(container.querySelector("div")).toBeInTheDocument();

        editor.setValue("<p>edited</p>");
        expect(onChange).toHaveBeenCalledWith("<p>edited</p>");
    });

    it("disposes the editor on unmount", async () => {
        const editor = fakeEditor("");
        (monaco.editor.create as any).mockImplementation(() => editor);
        const { unmount } = render(<MonacoHtmlEditor value="" onChange={vi.fn()} />);

        await vi.waitFor(() => expect(monaco.editor.create).toHaveBeenCalledTimes(1));
        unmount();

        expect(editor.dispose).toHaveBeenCalledTimes(1);
    });

    it("does not create an editor if unmounted before monaco finishes loading", async () => {
        (monaco.editor.create as any).mockImplementation(() => fakeEditor(""));
        const { unmount } = render(<MonacoHtmlEditor value="" onChange={vi.fn()} />);

        unmount();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(monaco.editor.create).not.toHaveBeenCalled();
    });

    it("accepts a custom height", async () => {
        (monaco.editor.create as any).mockImplementation(() => fakeEditor(""));
        const { container } = render(<MonacoHtmlEditor value="" onChange={vi.fn()} height="600px" />);
        expect((container.querySelector("div") as HTMLDivElement).style.height).toBe("600px");
    });
});
