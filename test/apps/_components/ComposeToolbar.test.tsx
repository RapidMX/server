// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ComposeToolbar from "../../../apps/shared/components/mail/compose/ComposeToolbar.js";

/**
 * A minimal fake `Editor` exposing exactly the chainable command surface `ComposeToolbar` drives —
 * `.chain()` returns an object where every command method records its own name (plus args) into
 * `calls` and returns itself for further chaining, ending in `.run()`. Mirrors this codebase's
 * established "hand-built fake exposing exactly what's called" pattern (see `MonacoHtmlEditor.test.tsx`'s
 * `fakeEditor`), just chainable rather than flat since TipTap's command API is chainable.
 */
function fakeEditor(options: {
    active?: Record<string, boolean>;
    attributes?: Record<string, Record<string, unknown>>;
    canUndo?: boolean;
    canRedo?: boolean;
} = {}) {
    const calls: string[] = [];
    const COMMANDS = [
        "toggleBold",
        "toggleItalic",
        "toggleUnderline",
        "toggleStrike",
        "setFontFamily",
        "unsetFontFamily",
        "setFontSize",
        "unsetFontSize",
        "setColor",
        "toggleHighlight",
        "setTextAlign",
        "toggleBulletList",
        "toggleOrderedList",
        "liftListItem",
        "sinkListItem",
        "extendMarkRange",
        "unsetLink",
        "setLink",
        "setImage",
        "insertTable",
        "unsetAllMarks",
        "clearNodes",
        "undo",
        "redo",
    ] as const;
    const chain: any = {
        focus: () => chain,
        run: () => {
            calls.push("run");
            return true;
        },
    };
    for (const name of COMMANDS) {
        chain[name] = (...args: unknown[]) => {
            calls.push(args.length > 0 ? `${name}(${JSON.stringify(args)})` : name);
            return chain;
        };
    }
    return {
        calls,
        chain: () => chain,
        can: () => ({ undo: () => options.canUndo ?? true, redo: () => options.canRedo ?? true }),
        isActive: (name: string | Record<string, unknown>) => {
            const key = typeof name === "string" ? name : JSON.stringify(name);
            return options.active?.[key] ?? false;
        },
        getAttributes: (name: string) => options.attributes?.[name] ?? {},
    } as any;
}

describe("ComposeToolbar", () => {
    it("disables every control when the editor hasn't mounted yet (editor === null)", () => {
        render(<ComposeToolbar editor={null} />);

        expect(screen.getByLabelText("Bold")).toBeDisabled();
        expect(screen.getByLabelText("Font family")).toBeDisabled();
        expect(screen.getByLabelText("Font size")).toBeDisabled();
        expect(screen.getByLabelText("Text color")).toBeDisabled();
        expect(screen.getByLabelText("Undo")).toBeDisabled();
        expect(screen.getByLabelText("Redo")).toBeDisabled();
    });

    it.each([
        ["Bold", "toggleBold"],
        ["Italic", "toggleItalic"],
        ["Underline", "toggleUnderline"],
        ["Strikethrough", "toggleStrike"],
        ["Highlight", "toggleHighlight"],
        ["Align left", 'setTextAlign(["left"])'],
        ["Align center", 'setTextAlign(["center"])'],
        ["Align right", 'setTextAlign(["right"])'],
        ["Justify", 'setTextAlign(["justify"])'],
        ["Bulleted list", "toggleBulletList"],
        ["Numbered list", "toggleOrderedList"],
        ["Decrease indent", 'liftListItem(["listItem"])'],
        ["Increase indent", 'sinkListItem(["listItem"])'],
        [
            "Insert table",
            'insertTable([{"rows":3,"cols":3,"withHeaderRow":true}])',
        ],
        ["Clear formatting", "unsetAllMarks"],
        ["Undo", "undo"],
        ["Redo", "redo"],
    ])("clicking %s runs the %s command", async (label, expectedCall) => {
        const editor = fakeEditor();
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        await user.click(screen.getByLabelText(label));

        expect(editor.calls).toContain(expectedCall);
        expect(editor.calls[editor.calls.length - 1]).toBe("run");
    });

    it("renders a button as active (pressed) when the editor reports that mark/node as active", () => {
        const editor = fakeEditor({ active: { bold: true } });
        render(<ComposeToolbar editor={editor} />);

        expect(screen.getByLabelText("Bold")).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByLabelText("Italic")).toHaveAttribute("aria-pressed", "false");
    });

    it("disables Undo/Redo when the editor reports the history stack is empty", () => {
        const editor = fakeEditor({ canUndo: false, canRedo: false });
        render(<ComposeToolbar editor={editor} />);

        expect(screen.getByLabelText("Undo")).toBeDisabled();
        expect(screen.getByLabelText("Redo")).toBeDisabled();
    });

    it("changes font family, and clears it when the default option is chosen", async () => {
        const editor = fakeEditor();
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        await user.selectOptions(screen.getByLabelText("Font family"), "Serif");
        expect(editor.calls).toContain('setFontFamily(["Georgia, \'Times New Roman\', serif"])');

        await user.selectOptions(screen.getByLabelText("Font family"), "Default");
        expect(editor.calls).toContain("unsetFontFamily");
    });

    it("shows the editor's current font family in the select.", () => {
        const editor = fakeEditor({ attributes: { textStyle: { fontFamily: "Arial, Helvetica, sans-serif" } } });
        render(<ComposeToolbar editor={editor} />);

        expect(screen.getByLabelText("Font family")).toHaveValue("Arial, Helvetica, sans-serif");
    });

    it("changes font size, and clears it when the default option is chosen", async () => {
        const editor = fakeEditor();
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        await user.selectOptions(screen.getByLabelText("Font size"), "Large");
        expect(editor.calls).toContain('setFontSize(["18px"])');

        await user.selectOptions(screen.getByLabelText("Font size"), "Normal");
        expect(editor.calls).toContain("unsetFontSize");
    });

    it("shows the editor's current font size in the select.", () => {
        const editor = fakeEditor({ attributes: { textStyle: { fontSize: "12px" } } });
        render(<ComposeToolbar editor={editor} />);

        expect(screen.getByLabelText("Font size")).toHaveValue("12px");
    });

    it("applies a text color via the color input.", () => {
        const editor = fakeEditor();
        render(<ComposeToolbar editor={editor} />);

        // jsdom's <input type="color"> doesn't support typing an arbitrary hex string via userEvent, so
        // drive the change handler directly instead — the same approach this codebase already uses for
        // other native-input edge cases (e.g. compose's file input tests).
        fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#ff0000" } });

        expect(editor.calls).toContain('setColor(["#ff0000"])');
    });

    it("shows the editor's current text color in the color input.", () => {
        const editor = fakeEditor({ attributes: { textStyle: { color: "#00ff00" } } });
        render(<ComposeToolbar editor={editor} />);

        expect(screen.getByLabelText("Text color")).toHaveValue("#00ff00");
    });

    it("prompts for an image URL and inserts it when one is given.", async () => {
        const editor = fakeEditor();
        const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com/pic.png");
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        await user.click(screen.getByLabelText("Insert image"));

        expect(editor.calls).toContain('setImage([{"src":"https://example.com/pic.png"}])');
        promptSpy.mockRestore();
    });

    it("does not insert an image when the URL prompt is cancelled.", async () => {
        const editor = fakeEditor();
        const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        await user.click(screen.getByLabelText("Insert image"));

        expect(editor.calls).not.toContain(expect.stringContaining("setImage"));
        promptSpy.mockRestore();
    });

    it("opens a link prompt, applies a link, then closes the prompt.", async () => {
        const editor = fakeEditor();
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        await user.click(screen.getByLabelText("Insert link"));
        const urlInput = await screen.findByLabelText("Link URL");
        await user.type(urlInput, "https://example.com");
        await user.click(screen.getByRole("button", { name: "Apply" }));

        expect(editor.calls).toContain('extendMarkRange(["link"])');
        expect(editor.calls).toContain('setLink([{"href":"https://example.com"}])');
        expect(screen.queryByLabelText("Link URL")).not.toBeInTheDocument();
    });

    it("removes a link when the prompt is submitted empty.", async () => {
        const editor = fakeEditor({ active: { link: true }, attributes: { link: { href: "https://old.example.com" } } });
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        const linkButton = screen.getByLabelText("Insert link");
        expect(linkButton).toHaveAttribute("aria-pressed", "true");
        await user.click(linkButton);

        const urlInput = await screen.findByLabelText("Link URL");
        expect(urlInput).toHaveValue("https://old.example.com");
        await user.clear(urlInput);
        await user.click(screen.getByRole("button", { name: "Apply" }));

        expect(editor.calls).toContain("unsetLink");
    });

    it("closes the link prompt without applying anything when cancelled.", async () => {
        const editor = fakeEditor();
        const user = userEvent.setup();
        render(<ComposeToolbar editor={editor} />);

        await user.click(screen.getByLabelText("Insert link"));
        await screen.findByLabelText("Link URL");
        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.queryByLabelText("Link URL")).not.toBeInTheDocument();
        expect(editor.calls).not.toContain("setLink");
        expect(editor.calls).not.toContain("unsetLink");
    });
});
