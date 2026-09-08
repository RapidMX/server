///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { AuditLogRouteSQL } from "@rapidmx/restapi/sql";
import { RouteDecorators } from "@rapidrest/service-core";

const { ApiRoute } = RouteDecorators;

@ApiRoute("mail/audit-log")
export class AuditLogRoute extends AuditLogRouteSQL {}
