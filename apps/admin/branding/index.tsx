///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../../shared/lib/api.js";
import {
    Branding,
    deleteBrandingLogo,
    deleteBrandingStylesheet,
    getBranding,
    updateBranding,
    uploadBrandingLogo,
    uploadBrandingStylesheet,
} from "../../shared/lib/brandingApi.js";
import AdminShell, { AdminShellProps } from "../../shared/components/admin/layout/AdminShell.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";

const INPUT_CLASS =
    "w-full text-sm py-2 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

export default function BrandingPage(props: Omit<AdminShellProps, "active">) {
    return (
        <AdminShell {...props} active="branding">
            <BrandingContent />
        </AdminShell>
    );
}

function BrandingContent() {
    const [branding, setBranding] = useState<Branding | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        getBranding()
            .then(setBranding)
            .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : "Could not load branding."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }
    if (loadError || !branding) {
        return <Alert>{loadError}</Alert>;
    }
    return <BrandingForm branding={branding} onChange={setBranding} />;
}

function BrandingForm({ branding, onChange }: { branding: Branding; onChange: (b: Branding) => void }) {
    const [companyName, setCompanyName] = useState(branding.companyName);
    const [title, setTitle] = useState(branding.title);
    const [headerHtml, setHeaderHtml] = useState(branding.headerHtml ?? "");
    const [footerHtml, setFooterHtml] = useState(branding.footerHtml ?? "");
    const [logoUrlInput, setLogoUrlInput] = useState(branding.logoUrl ?? "");
    const [stylesheetUrlInput, setStylesheetUrlInput] = useState(branding.stylesheetUrl ?? "");

    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [assetBusy, setAssetBusy] = useState<string | null>(null);

    const logoFileRef = useRef<HTMLInputElement>(null);
    const stylesheetFileRef = useRef<HTMLInputElement>(null);

    function runAsset(name: string, action: () => Promise<Branding>) {
        setError(null);
        setAssetBusy(name);
        return action()
            .then((updated) => {
                onChange(updated);
                setLogoUrlInput(updated.logoUrl ?? "");
                setStylesheetUrlInput(updated.stylesheetUrl ?? "");
            })
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not update branding."))
            .finally(() => setAssetBusy(null));
    }

    function handleLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        void runAsset("logo-upload", () => uploadBrandingLogo(file));
        e.target.value = "";
    }

    function handleStylesheetFileChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        void runAsset("stylesheet-upload", () => uploadBrandingStylesheet(file));
        e.target.value = "";
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const updated = await updateBranding({ companyName, title, headerHtml, footerHtml });
            onChange(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save branding.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="max-w-2xl">
            <h1 className="text-xl font-bold uppercase tracking-wide mb-1">Branding</h1>
            <p className="text-sm text-text-muted mb-5">
                Customize the logo, product name, and chrome shown to every visitor of the webmail and admin
                console — including anonymous booking-page visitors.
            </p>

            {error && <Alert>{error}</Alert>}
            {saved && !error && <div className="mb-4 text-sm text-success font-medium">Saved.</div>}

            <div className="flex flex-col gap-6">
                <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Logo</h2>
                    <div className="flex items-center gap-4">
                        <img
                            src={branding.logoUrl || "/images/logo.svg"}
                            alt="Current logo"
                            width="64"
                            height="64"
                            className="border border-border rounded-sm bg-surface-alt p-1"
                        />
                        <div className="flex flex-col gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                className="!w-auto"
                                loading={assetBusy === "logo-upload"}
                                disabled={assetBusy !== null}
                                onClick={() => logoFileRef.current?.click()}
                            >
                                Upload logo
                            </Button>
                            <input
                                ref={logoFileRef}
                                type="file"
                                accept="image/*"
                                aria-label="Upload logo"
                                className="hidden"
                                onChange={handleLogoFileChange}
                            />
                            {branding.logoUrl && (
                                <Button
                                    type="button"
                                    variant="text"
                                    disabled={assetBusy !== null}
                                    loading={assetBusy === "logo-delete"}
                                    onClick={() => void runAsset("logo-delete", async () => {
                                        await deleteBrandingLogo();
                                        return { ...branding, logoUrl: undefined };
                                    })}
                                >
                                    Remove logo
                                </Button>
                            )}
                        </div>
                    </div>
                    <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold">Or use an external image URL</span>
                        <div className="flex gap-2">
                            <input
                                aria-label="Logo URL"
                                className={INPUT_CLASS}
                                value={logoUrlInput}
                                onChange={(e) => setLogoUrlInput(e.target.value)}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                className="!w-auto"
                                disabled={assetBusy !== null || logoUrlInput === (branding.logoUrl ?? "")}
                                loading={assetBusy === "logo-url"}
                                onClick={() => void runAsset("logo-url", () => updateBranding({ logoUrl: logoUrlInput }))}
                            >
                                Set
                            </Button>
                        </div>
                    </label>
                </section>

                <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Custom stylesheet</h2>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-text-muted truncate">
                            {branding.stylesheetUrl || "None configured"}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            className="!w-auto"
                            loading={assetBusy === "stylesheet-upload"}
                            disabled={assetBusy !== null}
                            onClick={() => stylesheetFileRef.current?.click()}
                        >
                            Upload CSS file
                        </Button>
                        <input
                            ref={stylesheetFileRef}
                            type="file"
                            accept="text/css,.css"
                            aria-label="Upload stylesheet"
                            className="hidden"
                            onChange={handleStylesheetFileChange}
                        />
                        {branding.stylesheetUrl && (
                            <Button
                                type="button"
                                variant="text"
                                disabled={assetBusy !== null}
                                loading={assetBusy === "stylesheet-delete"}
                                onClick={() => void runAsset("stylesheet-delete", async () => {
                                    await deleteBrandingStylesheet();
                                    return { ...branding, stylesheetUrl: undefined };
                                })}
                            >
                                Remove stylesheet
                            </Button>
                        )}
                    </div>
                    <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold">Or use an external stylesheet URL</span>
                        <div className="flex gap-2">
                            <input
                                aria-label="Stylesheet URL"
                                className={INPUT_CLASS}
                                value={stylesheetUrlInput}
                                onChange={(e) => setStylesheetUrlInput(e.target.value)}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                className="!w-auto"
                                disabled={assetBusy !== null || stylesheetUrlInput === (branding.stylesheetUrl ?? "")}
                                loading={assetBusy === "stylesheet-url"}
                                onClick={() =>
                                    void runAsset("stylesheet-url", () => updateBranding({ stylesheetUrl: stylesheetUrlInput }))
                                }
                            >
                                Set
                            </Button>
                        </div>
                    </label>
                </section>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2 border-t border-border">
                    <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold">Company name</span>
                        <input
                            aria-label="Company name"
                            className={INPUT_CLASS}
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold">Product title</span>
                        <input
                            aria-label="Product title"
                            className={INPUT_CLASS}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                        <span className="text-xs text-text-muted">Shown as the browser tab title.</span>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold">Header HTML (optional)</span>
                        <textarea
                            aria-label="Header HTML"
                            className={`${INPUT_CLASS} font-mono`}
                            rows={3}
                            value={headerHtml}
                            onChange={(e) => setHeaderHtml(e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold">Footer HTML (optional)</span>
                        <textarea
                            aria-label="Footer HTML"
                            className={`${INPUT_CLASS} font-mono`}
                            rows={3}
                            value={footerHtml}
                            onChange={(e) => setFooterHtml(e.target.value)}
                        />
                    </label>
                    <div>
                        <Button type="submit" loading={saving} disabled={saving} className="!w-auto">
                            Save
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
