///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import { ApiRequestError } from "../../../shared/lib/api.js";
import {
    getTransportRule,
    TransportRule,
    TransportRuleAction,
    TransportRuleConditions,
    updateTransportRule,
} from "../../../shared/lib/transportRulesApi.js";
import AdminShell, { AdminShellProps } from "../../../shared/components/admin/layout/AdminShell.js";
import RuleBuilder, { RuleBuilderValue } from "../../../shared/components/rules/RuleBuilder.js";
import { TRANSPORT_RULE_ACTION_TYPES, TRANSPORT_RULE_CONDITION_FIELDS } from "../transportRuleConfig.js";
import Alert from "../../../shared/components/feedback/Alert.js";
import Button from "../../../shared/components/buttons/Button.js";
import FormField from "../../../shared/components/forms/FormField.js";

const INPUT_CLASS =
    "w-full text-sm py-2.5 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

/** This framework has no dynamic route segments — the target rule's uid comes from the query string
 * instead, same convention as every other admin detail page (e.g. `mailboxes/detail`). */
export function readTargetUid(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("uid");
}

export default function TransportRuleDetailPage(props: Omit<AdminShellProps, "active">) {
    return (
        <AdminShell {...props} active="transportRules">
            <TransportRuleDetailContent />
        </AdminShell>
    );
}

function TransportRuleDetailContent() {
    const [uid, setUid] = useState<string | null>(null);
    const [original, setOriginal] = useState<TransportRule | null>(null);
    const [name, setName] = useState("");
    const [rule, setRule] = useState<RuleBuilderValue<TransportRuleConditions, TransportRuleAction> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setUid(readTargetUid());
    }, []);

    useEffect(() => {
        if (!uid) {
            return;
        }
        setLoading(true);
        setError(null);
        getTransportRule(uid)
            .then((loaded) => {
                setOriginal(loaded);
                if (loaded) {
                    setName(loaded.name);
                    setRule({
                        enabled: loaded.enabled,
                        sequence: loaded.sequence,
                        stopProcessingRules: loaded.stopProcessingRules,
                        conditions: loaded.conditions,
                        actions: loaded.actions,
                    });
                }
            })
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this transport rule."))
            .finally(() => setLoading(false));
    }, [uid]);

    // Only ever invoked from the form below, which itself only renders once `original`/`rule` are
    // loaded (the early returns above cover every other state) — the non-null assertions reflect that
    // real invariant, not an unchecked assumption. Matches `QuarantineContent.handleRelease`'s and
    // `DomainDetailContent.handleVerify`'s identical pattern.
    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError("A name is required.");
            return;
        }

        setSaving(true);
        setSaved(false);
        try {
            const updated = await updateTransportRule({
                uid: original!.uid,
                version: original!.version,
                name: name.trim(),
                ...rule!,
            });
            setOriginal(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save this transport rule.");
        } finally {
            setSaving(false);
        }
    }

    if (!uid) {
        return <Alert>No transport rule specified.</Alert>;
    }
    if (loading) {
        return <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }
    if (error && !original) {
        return <Alert>{error}</Alert>;
    }
    if (!original || !rule) {
        return <Alert>Transport rule not found.</Alert>;
    }

    return (
        <div className="max-w-3xl">
            <a href="/admin/transport-rules" className="text-sm text-primary-dark hover:underline">
                &larr; All transport rules
            </a>
            <h1 className="text-xl font-bold tracking-tight mt-1 mb-5">{original.name}</h1>

            {error && <Alert>{error}</Alert>}
            {saved && !error && (
                <div className="mb-4 text-sm text-success font-medium">Saved.</div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="bg-surface border border-border rounded-md p-6">
                    <FormField label="Name" htmlFor="name">
                        <input
                            id="name"
                            type="text"
                            className={INPUT_CLASS}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </FormField>
                </div>

                <RuleBuilder
                    value={rule}
                    onChange={setRule}
                    conditionFields={TRANSPORT_RULE_CONDITION_FIELDS}
                    actionTypes={TRANSPORT_RULE_ACTION_TYPES}
                />

                <div>
                    <Button type="submit" loading={saving} disabled={saving} className="!w-auto">
                        Save changes
                    </Button>
                </div>
            </form>
        </div>
    );
}
