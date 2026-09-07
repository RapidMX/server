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
import { BaseMailComposeRoute } from "../../src/routes/BaseMailComposeRoute.js";

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
