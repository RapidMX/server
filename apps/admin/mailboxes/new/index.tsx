///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import { ApiRequestError } from "../../../shared/lib/api.js";
import { createMailbox, listMailboxDomains } from "../../../shared/lib/mailApi.js";
import AdminShell, { AdminShellProps } from "../../../shared/components/admin/layout/AdminShell.js";
import Alert from "../../../shared/components/feedback/Alert.js";
import Button from "../../../shared/components/buttons/Button.js";
import FormField from "../../../shared/components/forms/FormField.js";

const INPUT_CLASS =
    "w-full text-sm py-2.5 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";
const SELECT_CLASS =
    "text-sm py-2.5 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

export default function NewMailboxPage(props: AdminShellProps) {
    return (
        <AdminShell {...props}>
            <NewMailboxForm />
        </AdminShell>
    );
}

function NewMailboxForm() {
    const [primarySmtpAddress, setPrimarySmtpAddress] = useState("");
    const [localPart, setLocalPart] = useState("");
    const [domains, setDomains] = useState<string[]>([]);
    const [domain, setDomain] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [ownerUserUid, setOwnerUserUid] = useState("");
    const [timezone, setTimezone] = useState("UTC");
    const [quotaGb, setQuotaGb] = useState(5);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // An empty `mail:domains` list (the default) means this server enforces no domain restriction —
    // the address field stays free text, exactly as before. Once an admin configures at least one
    // domain, every mailbox this server creates must be on one of them (enforced server-side too, in
    // `BaseMailboxRoute.create()`), so the form switches to a local-part input + domain dropdown to
    // make that restriction visible rather than let an admin discover it only via a rejected submit.
    useEffect(() => {
        listMailboxDomains()
            .then((list) => {
                setDomains(list);
                setDomain(list[0] ?? "");
            })
            .catch(() => undefined);
    }, []);

    const constrained = domains.length > 0;

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        const address = constrained ? `${localPart.trim()}@${domain}` : primarySmtpAddress.trim();
        if (constrained ? !localPart.trim() : !primarySmtpAddress.trim()) {
            setError("A primary SMTP address is required.");
            return;
        }
        if (!displayName.trim()) {
            setError("A display name is required.");
            return;
        }

        setSaving(true);
        try {
            // ownerUserUid left blank creates a true ownerless shared mailbox (e.g. support@example.com);
            // delegates are then granted access from the mailbox's detail page.
            const mailbox = await createMailbox({
                primarySmtpAddress: address,
                displayName: displayName.trim(),
                ownerUserUid: ownerUserUid.trim() || undefined,
                timezone,
                quotaBytes: Math.round(quotaGb * 1_000_000_000),
            });
            window.location.href = `/admin/mailboxes/detail?uid=${encodeURIComponent(mailbox.uid)}`;
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not create the mailbox.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="max-w-xl">
            <h1 className="text-xl font-bold tracking-tight mb-1">New mailbox</h1>
            <p className="text-sm text-text-muted mb-5">
                Leave "Owner user uid" blank to create a true ownerless shared mailbox (the Exchange "shared
                mailbox" concept) — access is then granted entirely to delegates afterward, not to a single
                owner. Set an owner to create a mailbox for a specific user instead.
            </p>

            {error && <Alert>{error}</Alert>}

            <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-md p-6">
                {constrained ? (
                    <FormField label="Local part" htmlFor="localPart">
                        <div className="flex gap-2 items-center">
                            <input
                                id="localPart"
                                type="text"
                                className={INPUT_CLASS}
                                value={localPart}
                                onChange={(e) => setLocalPart(e.target.value)}
                                placeholder="support"
                            />
                            <span className="text-text-muted shrink-0">@</span>
                            <select
                                aria-label="Domain"
                                className={SELECT_CLASS}
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                            >
                                {domains.map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </FormField>
                ) : (
                    <FormField label="Primary SMTP address" htmlFor="primarySmtpAddress">
                        <input
                            id="primarySmtpAddress"
                            type="email"
                            className={INPUT_CLASS}
                            value={primarySmtpAddress}
                            onChange={(e) => setPrimarySmtpAddress(e.target.value)}
                            placeholder="support@example.com"
                        />
                    </FormField>
                )}

                <FormField label="Display name" htmlFor="displayName">
                    <input
                        id="displayName"
                        type="text"
                        className={INPUT_CLASS}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Support"
                    />
                </FormField>

                <FormField label="Owner user uid (optional)" htmlFor="ownerUserUid">
                    <input
                        id="ownerUserUid"
                        type="text"
                        className={INPUT_CLASS}
                        value={ownerUserUid}
                        onChange={(e) => setOwnerUserUid(e.target.value)}
                        placeholder="Leave blank for a shared mailbox"
                    />
                </FormField>

                <FormField label="Timezone" htmlFor="timezone">
                    <input
                        id="timezone"
                        type="text"
                        className={INPUT_CLASS}
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        placeholder="America/Los_Angeles"
                    />
                </FormField>

                <FormField label="Quota (GB)" htmlFor="quotaGb">
                    <input
                        id="quotaGb"
                        type="number"
                        min={1}
                        step={1}
                        className={INPUT_CLASS}
                        value={quotaGb}
                        onChange={(e) => setQuotaGb(Number(e.target.value))}
                    />
                </FormField>

                <div className="flex gap-3 mt-2">
                    <Button type="submit" loading={saving} disabled={saving} className="!w-auto">
                        Create mailbox
                    </Button>
                    <a href="/admin">
                        <Button type="button" variant="secondary" className="!w-auto">
                            Cancel
                        </Button>
                    </a>
                </div>
            </form>
        </div>
    );
}
