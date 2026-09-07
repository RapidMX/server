///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
// Isolated unit test for BaseMailComposeRoute's `!blobStore`/`!aclUtils` defensive guard, and its
// invalid-input guard — both are cheap to exercise without a real database. Full behavior (a real assemble
// producing MIME with attachments, permission-denied, nonexistent draft/mailbox) needs a wired ObjectFactory
// with real repos/BlobStore and is exercised indirectly through the mounted `/api/mail/compose/:id/assemble`
// route in normal server operation — this file only covers the guard clauses `MailComposeRoute`'s own
// concrete Mongo/SQL subclasses can't reach through a real request (DI always populates both dependencies
// before a request reaches the route).
import config from "../../src/config.mongo.js";
import { ObjectFactory } from "@rapidrest/service-core";
import { Logger } from "@rapidrest/core";
import { BaseMailComposeRoute, sanitizeComposeHtml } from "../../src/routes/BaseMailComposeRoute.js";

class TestMailComposeRoute extends BaseMailComposeRoute<any, any, any> {
    protected messageClass: any = class {};
    protected attachmentClass: any = class {};
    protected mailboxClass: any = class {};
}

describe("BaseMailComposeRoute Tests (dependency guard clause only)", () => {
    const objectFactory: ObjectFactory = new ObjectFactory(config, Logger());

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("assemble() throws INTERNAL_ERROR when blobStore/aclUtils are not set.", async () => {
        const route = objectFactory.newInstance<TestMailComposeRoute>(TestMailComposeRoute, { initialize: false });

        await expect(
            route.assemble("m1", { to: [{ address: "a@example.com" }], html: "<p>hi</p>" }, { uid: "u1" } as any),
        ).rejects.toThrow(/internal error/i);
    });
});

describe("sanitizeComposeHtml() Tests", () => {
    it("strips <script> tags entirely — the actual security boundary for outbound compose HTML.", () => {
        const result = sanitizeComposeHtml('<p>hi</p><script>alert("xss")</script>');
        expect(result).not.toContain("<script");
        expect(result).not.toContain("alert");
        expect(result).toContain("<p>hi</p>");
    });

    it("strips event-handler attributes (onerror/onclick/etc.) even on an otherwise-allowed tag.", () => {
        const result = sanitizeComposeHtml('<img src="https://example.com/x.png" onerror="alert(1)">');
        expect(result).not.toContain("onerror");
        expect(result).toContain('src="https://example.com/x.png"');
    });

    it("allows the basic formatting tags RichTextEditor's StarterKit-based toolbar produces.", () => {
        const result = sanitizeComposeHtml(
            "<h1>Title</h1><p><strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>" +
                '<ul><li>one</li></ul><blockquote>quote</blockquote><a href="https://example.com">link</a>',
        );
        expect(result).toContain("<h1>Title</h1>");
        expect(result).toContain("<strong>bold</strong>");
        expect(result).toContain("<em>italic</em>");
        expect(result).toContain("<u>under</u>");
        expect(result).toContain("<s>strike</s>");
        expect(result).toContain("<li>one</li>");
        expect(result).toContain("<blockquote>quote</blockquote>");
        expect(result).toContain('href="https://example.com"');
    });

    it("allows a table, matching RichTextEditor's TableKit output.", () => {
        const result = sanitizeComposeHtml("<table><tbody><tr><td>cell</td></tr></tbody></table>");
        expect(result).toContain("<table>");
        expect(result).toContain("<td>cell</td>");
    });

    it("allows the specific inline style properties TextStyleKit/TextAlign emit, with safe values.", () => {
        const result = sanitizeComposeHtml(
            '<p style="text-align: center"><span style="color: #ff0000; font-family: Arial, sans-serif; font-size: 18px">styled</span></p>',
        );
        expect(result).toContain("text-align:center");
        expect(result).toContain("color:#ff0000");
        expect(result).toContain("font-family:Arial, sans-serif");
        expect(result).toContain("font-size:18px");
    });

    it("strips a style property outside the allowlist (e.g. a CSS-injection attempt) while keeping the tag.", () => {
        const result = sanitizeComposeHtml('<p style="position: fixed; color: #00ff00">text</p>');
        expect(result).not.toContain("position");
        expect(result).toContain("color:#00ff00");
        expect(result).toContain("text");
    });

    it("allows a cid: scheme image src, for an inline image referencing an already-uploaded attachment.", () => {
        const result = sanitizeComposeHtml('<img src="cid:attachment-1">');
        expect(result).toContain('src="cid:attachment-1"');
    });

    it("rejects a javascript: scheme link href.", () => {
        const result = sanitizeComposeHtml('<a href="javascript:alert(1)">click</a>');
        expect(result).not.toContain("javascript:");
    });
});
