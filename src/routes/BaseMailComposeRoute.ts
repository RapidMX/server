///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import sanitizeHtml from "sanitize-html";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { ApiError, ObjectDecorators, type JWTUser } from "@rapidrest/core";
import {
    ACLAction,
    ACLUtils,
    ApiErrorMessages,
    ApiErrors,
    DocDecorators,
    ObjectFactory,
    RepoUtils,
    RouteDecorators,
} from "@rapidrest/service-core";
import { Attachment, BlobStore, Mailbox, Message, Recipient, RecipientType } from "@rapidmx/restapi";
const { Inject } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Param, Post, User: AuthUser } = RouteDecorators;

/** The structured compose input a webmail client submits — see `apps/shared/lib/mailApi.ts`'s `assembleDraft`. */
export interface ComposeAssembleInput {
    to: Recipient[];
    cc?: Recipient[];
    bcc?: Recipient[];
    subject?: string;
    html: string;
}

function toNodemailerAddress(recipient: Recipient): { name?: string; address: string } {
    return { name: recipient.displayName, address: recipient.address };
}

/**
 * `assemble()` is the one place a webmail client's own HTML — never sanitized client-side against anything
 * a malicious/compromised browser extension or a bug in the rich-text editor could produce — reaches this
 * server on its way into a real outbound MIME message and this draft's stored preview text. Unlike inbound
 * mail (sanitized by `@rapidmx/restapi`'s own `ScanPipeline.sanitize()`, via the same `sanitize-html`
 * library, before ever being rendered back to a browser), nothing upstream of this route sanitizes outbound
 * compose input at all — this is the sole gate. Allowlist covers exactly what `RichTextEditor`'s configured
 * TipTap extensions can actually produce (`apps/shared/components/mail/compose/RichTextEditor.tsx`): basic
 * formatting/structure tags, `style` attributes for `TextStyleKit`'s color/font-family/font-size and
 * `TextAlign`'s alignment (deliberately allowlisted by property+value pattern, not left wide open — an
 * unrestricted `style` attribute is its own injection surface), links/images (`cid:` allowed since an
 * inline image could reference an already-uploaded attachment by Content-ID), and tables.
 */
export function sanitizeComposeHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: [
            "p",
            "br",
            "hr",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "strong",
            "em",
            "u",
            "s",
            "mark",
            "ul",
            "ol",
            "li",
            "blockquote",
            "pre",
            "code",
            "a",
            "img",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "span",
        ],
        allowedAttributes: {
            a: ["href", "target", "rel"],
            img: ["src", "alt", "title", "width", "height"],
            "*": ["style"],
        },
        allowedStyles: {
            "*": {
                color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
                "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
                "font-family": [/^[-,'"a-z0-9\s]+$/i],
                "font-size": [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
                "text-align": [/^(?:left|right|center|justify)$/],
            },
        },
        allowedSchemes: ["http", "https", "mailto", "cid"],
        allowVulnerableTags: false,
        disallowedTagsMode: "discard",
    });
}

/**
 * Rewrites `<img>` references to this draft's own already-uploaded attachments (by their
 * `/mail/attachments/:uid/content` URL — see `apps/shared/lib/mailApi.ts`'s `attachmentContentUrl()`)
 * into `cid:` references instead, matching each attachment's own `contentId`.
 *
 * The client's rich-text editor can't render a `cid:` URL at all (browsers only resolve that scheme
 * inside an actual MIME-rendering mail client, never a live DOM) — so while composing, an inserted
 * image points at this server's own authenticated content endpoint instead, which the browser *can*
 * fetch, for a working live preview. That URL is meaningless outside this server, though (a
 * recipient's mail client has no session cookie to fetch it with), so it's rewritten to the `cid:`
 * form the message actually ships with here, at assemble time — after this point, `attachments` is
 * always built with that same `contentId` as each attachment's own MIME `cid` (see below), so a
 * rewritten reference always resolves for the recipient.
 */
export function rewriteInlineImageSources(html: string, attachments: { uid: string; contentId?: string }[]): string {
    let result = html;
    for (const attachment of attachments) {
        if (!attachment.contentId) {
            continue;
        }
        result = result.split(`/api/mail/attachments/${attachment.uid}/content`).join(`cid:${attachment.contentId}`);
    }
    return result;
}

/** A short, tag-stripped plain-text preview, mirroring how `@rapidmx/restapi`'s own ingestion pipeline derives `bodyPreview`. */
function toPreview(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
}

/**
 * `mail-server`-local glue between the webmail compose UI and `@rapidmx/restapi`'s `BaseMessageRoute.send()`.
 *
 * `BaseMessageRoute.send()` deliberately does no MIME composition of its own — it expects a draft's
 * `bodyBlobKey` to already hold fully-assembled RFC 5322 source (see its doc comment) — because the library
 * has no opinion on how a caller composes a message (a webmail client, EAS's `ComposeMailCommand`, and MAPI's
 * `RopSubmitMessageHandler` all build MIME differently, from different starting inputs). This route is that
 * assembly step for the webmail client specifically: it turns structured `{to, cc, bcc, subject, html}` input
 * plus whatever `Attachment`s have already been uploaded against the draft (via the library's own
 * `BaseAttachmentRoute.upload`) into raw MIME via `nodemailer`'s `MailComposer` — the same serializer
 * `RopSubmitMessageHandler` already uses elsewhere in this library family for exactly this purpose — then
 * saves it back onto the draft. It does not send anything; the client still calls the library's own
 * `POST /messages/:id/send` afterward.
 *
 * The draft's `from` is always derived from its owning `Mailbox` (never taken from the client), so this
 * cannot be used to spoof a `From` address the caller's mailbox doesn't actually own.
 *
 * `messageClass`/`attachmentClass`/`mailboxClass` are supplied by the Mongo/SQL concrete subclasses.
 */
export abstract class BaseMailComposeRoute<M extends Message, A extends Attachment, X extends Mailbox> {
    protected abstract messageClass: any;
    protected abstract attachmentClass: any;
    protected abstract mailboxClass: any;

    // Automatically injected by ObjectFactory on instantiation
    private _objectFactory?: ObjectFactory;

    private messageRepo?: RepoUtils<M>;
    private attachmentRepo?: RepoUtils<A>;
    private mailboxRepo?: RepoUtils<X>;

    @Inject("BlobStore")
    private blobStore?: BlobStore;

    @Inject(ACLUtils)
    private aclUtils?: ACLUtils;

    private async init(): Promise<void> {
        if (!this.messageRepo) {
            this.messageRepo = await this._objectFactory!.newInstance(RepoUtils, {
                name: this.messageClass.name,
                args: [this.messageClass],
            });
        }
        if (!this.attachmentRepo) {
            this.attachmentRepo = await this._objectFactory!.newInstance(RepoUtils, {
                name: this.attachmentClass.name,
                args: [this.attachmentClass],
            });
        }
        if (!this.mailboxRepo) {
            this.mailboxRepo = await this._objectFactory!.newInstance(RepoUtils, {
                name: this.mailboxClass.name,
                args: [this.mailboxClass],
            });
        }
    }

    @Summary("Assemble compose draft into MIME")
    @Description(
        "Builds RFC 5322 MIME from structured compose input (recipients/subject/HTML body, plus whatever " +
            "attachments have already been uploaded against this draft) and stores it as the draft's " +
            "bodyBlobKey — does NOT send it. Call POST /messages/:id/send afterward to relay it.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/:id/assemble")
    public async assemble(
        @Param("id") id: string,
        body: ComposeAssembleInput,
        @AuthUser user?: JWTUser,
    ): Promise<M> {
        if (!this.blobStore || !this.aclUtils) {
            throw new ApiError(ApiErrors.INTERNAL_ERROR, 500, ApiErrorMessages.INTERNAL_ERROR);
        }
        await this.init();

        if (!body?.to?.length || !body.html) {
            throw new ApiError(ApiErrors.INVALID_REQUEST, 400, ApiErrorMessages.INVALID_REQUEST);
        }

        const message: M | undefined = await this.messageRepo!.findOne(id, { ignoreACL: true });
        if (!message) {
            throw new ApiError(ApiErrors.NOT_FOUND, 404, ApiErrorMessages.NOT_FOUND);
        }
        if (!(await this.aclUtils.hasPermission(user, message.folderUid, ACLAction.UPDATE))) {
            throw new ApiError(ApiErrors.AUTH_PERMISSION_FAILURE, 403, ApiErrorMessages.AUTH_PERMISSION_FAILURE);
        }

        const mailbox: X | undefined = await this.mailboxRepo!.findOne(message.mailboxUid, { ignoreACL: true });
        if (!mailbox) {
            throw new ApiError(ApiErrors.NOT_FOUND, 404, ApiErrorMessages.NOT_FOUND);
        }

        const attachmentRecords: A[] = await this.attachmentRepo!.find(
            { messageUid: message.uid },
            { ignoreACL: true, limit: 1000 },
        );
        const attachments = await Promise.all(
            attachmentRecords.map(async (attachment) => ({
                filename: attachment.filename,
                contentType: attachment.mimeType,
                content: await this.blobStore!.get(attachment.blobKey),
                cid: attachment.contentId,
            })),
        );

        const html = sanitizeComposeHtml(rewriteInlineImageSources(body.html, attachmentRecords));

        const from = { name: mailbox.displayName, address: mailbox.primarySmtpAddress };
        const raw: Buffer = await new MailComposer({
            from,
            to: body.to.map(toNodemailerAddress),
            cc: body.cc?.map(toNodemailerAddress),
            bcc: body.bcc?.map(toNodemailerAddress),
            subject: body.subject ?? "",
            html,
            attachments,
        })
            .compile()
            .build();

        const bodyBlobKey = `bodies/${crypto.randomUUID()}`;
        await this.blobStore.put(bodyBlobKey, raw, { contentType: "message/rfc822" });

        const recipients: Recipient[] = [
            ...body.to.map((r) => ({ ...r, type: RecipientType.TO })),
            ...(body.cc ?? []).map((r) => ({ ...r, type: RecipientType.CC })),
            ...(body.bcc ?? []).map((r) => ({ ...r, type: RecipientType.BCC })),
        ];

        return await this.messageRepo!.update(
            {
                uid: message.uid,
                version: (message as any).version,
                subject: body.subject ?? "",
                recipients,
                from: { address: mailbox.primarySmtpAddress, displayName: mailbox.displayName, type: RecipientType.TO },
                bodyBlobKey,
                bodyPreview: toPreview(html),
                hasAttachments: attachmentRecords.length > 0,
            } as any,
            message,
            { user, ignoreACL: true },
        );
    }
}
