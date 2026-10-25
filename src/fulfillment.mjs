import { DigitalGoodsFulfillment, createDurableFulfillment } from "@red-cup-engineering/digital-goods-storefront-services-section/durable-fulfillment";

/** Cloudflare's receiver-specific Durable Object class registration. */
export class ShopFulfillment extends DigitalGoodsFulfillment {}

function client(namespace) {
  return createDurableFulfillment(namespace, "shop.561.group");
}

export function createShopFulfillment(namespace) {
  return client(namespace);
}

/** Bind both original custody ports to the same native client. */
export function createShopFulfillmentBindings(namespace) {
  const fulfillment = client(namespace);
  return { fulfillment, audit: fulfillment?.audit ?? null };
}

/** The Stripe rail receives a persistent async audit sink and never falls
 * back to a local filesystem journal in this Worker. */
export function createShopStripeAudit(namespace) {
  return client(namespace)?.audit ?? null;
}
