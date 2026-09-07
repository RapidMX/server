///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { AccessControlListMongo, BaseACLRoute, RouteDecorators } from "@rapidrest/service-core";

const { ApiRoute, Model } = RouteDecorators;

// The mechanism for granting/revoking a mailbox's shared/delegate access (Exchange-style shared mailboxes) —
// see @rapidmx/restapi's BaseMailboxRoute doc comment. Generic, not mail-specific: any ACL-protected entity's
// access can be managed through this same route.
@Model(AccessControlListMongo)
@ApiRoute("acls")
export class ACLRoute extends BaseACLRoute<AccessControlListMongo> {}
