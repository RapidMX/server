///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { AuditLogRouteMongo } from "@rapidmx/restapi/mongo";
import { RouteDecorators } from "@rapidrest/service-core";

const { ApiRoute } = RouteDecorators;

@ApiRoute("mail/audit-log")
export class AuditLogRoute extends AuditLogRouteMongo {}
