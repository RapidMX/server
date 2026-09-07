///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { MailIngestRouteSQL } from "@rapidmx/restapi/sql";
import { RouteDecorators } from "@rapidrest/service-core";

const { Route } = RouteDecorators;

// Deliberately mounted outside of `/api` and authenticated via a bearer secret
// (`mail:transport:ingest:secret`), not JWT — this endpoint is the MTA (Postfix) hand-off contract, not a
// client-facing API. It must never be reachable through the public ingress; restrict it at the network/ingress
// level to only the Postfix container.
@Route("/internal/mta")
export class MailIngestRoute extends MailIngestRouteSQL {}
