///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { MailPushRoute } from "@rapidmx/restapi";
import { RouteDecorators } from "@rapidrest/service-core";

const { Route } = RouteDecorators;

@Route("/push")
export class PushRoute extends MailPushRoute {}
