import { Module } from "@nestjs/common";

import { MetaInstagramAdapter } from "./adapters/meta-instagram.adapter";
import { MetaMessengerAdapter } from "./adapters/meta-messenger.adapter";
import { MetaWhatsappAdapter } from "./adapters/meta-whatsapp.adapter";
import { ChannelsController } from "./channels/channels.controller";
import { ChannelsService } from "./channels/channels.service";
import { MetaHmacGuard } from "./guards/meta-hmac.guard";
import { MetaApiClient } from "./meta/meta-api.client";
import { MetaOAuthService } from "./meta/meta-oauth.service";
import { NormalizerService } from "./normalizer/normalizer.service";
import { OutboundProcessor } from "./outbound/outbound.processor";
import { OutboundService } from "./outbound/outbound.service";
import { WebhooksController } from "./webhooks/webhooks.controller";
import { WebhooksService } from "./webhooks/webhooks.service";

@Module({
  imports: [],
  controllers: [ChannelsController, WebhooksController],
  providers: [
    ChannelsService,
    MetaOAuthService,
    WebhooksService,
    MetaHmacGuard,
    MetaInstagramAdapter,
    MetaMessengerAdapter,
    MetaWhatsappAdapter,
    NormalizerService,
    MetaApiClient,
    OutboundService,
    OutboundProcessor,
  ],
  exports: [
    ChannelsService,
    MetaOAuthService,
    WebhooksService,
    MetaHmacGuard,
    MetaInstagramAdapter,
    MetaMessengerAdapter,
    MetaWhatsappAdapter,
    NormalizerService,
    MetaApiClient,
    OutboundService,
    OutboundProcessor,
  ],
})
export class IntegrationsModule {}
