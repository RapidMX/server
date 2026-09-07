///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "text";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
    variant?: ButtonVariant;
    /** Renders a small spinner before the button's content. */
    loading?: boolean;
    className?: string;
}

const BASE =
    "inline-flex items-center justify-center gap-2 font-semibold text-sm rounded-sm border transition-colors disabled:opacity-55 disabled:cursor-not-allowed active:translate-y-px";

const VARIANTS: Record<ButtonVariant, string> = {
    primary: "w-full py-2.5 px-4 bg-primary border-transparent text-white hover:not-disabled:bg-primary-dark",
    secondary:
        "w-full py-2.5 px-4 bg-transparent border-border text-text hover:not-disabled:border-primary hover:not-disabled:text-primary-dark",
    text: "w-auto py-1 px-0.5 border-transparent bg-transparent text-primary-dark hover:not-disabled:underline",
};

export default function Button({ variant = "primary", loading, className, children, ...rest }: ButtonProps) {
    return (
        <button className={[BASE, VARIANTS[variant], className].filter(Boolean).join(" ")} {...rest}>
            {loading && (
                <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
            )}
            {children}
        </button>
    );
}
