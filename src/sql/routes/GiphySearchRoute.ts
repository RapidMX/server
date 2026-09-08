///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseGiphySearchRoute } from "../../routes/BaseGiphySearchRoute.js";

const { ApiRoute } = RouteDecorators;

@ApiRoute("mail/giphy")
export class GiphySearchRoute extends BaseGiphySearchRoute {}
