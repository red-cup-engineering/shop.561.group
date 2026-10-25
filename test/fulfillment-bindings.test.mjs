import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createDigitalGoodsStorefrontWorker } from "@red-cup-engineering/digital-goods-storefront-services-section/worker-runtime";
import catalog from "../src/compiled-catalog.mjs";
import { ShopFulfillment, createShopFulfillment, createShopStripeAudit, createShopFulfillmentBindings } from "../src/fulfillment.mjs";

// The cookie fixture uses the exact authentication provider selected by the
// original storefront, rather than a second session implementation or key.
const originalRuntime = createRequire(import.meta.resolve("@red-cup-engineering/digital-goods-storefront-services-section/worker-runtime"));
const { createSessionCookie } = await import(pathToFileURL(originalRuntime.resolve("@red-cup-engineering/computer-web-server/admission/session")));

test("the original Shop binding supplies one custody client to the native read-only order join", async () => {
  let lists = 0;
  const rows = new Map();
  const storage = {
    async get(key) { return structuredClone(rows.get(key)); },
    async put() { assert.fail("an original-order read cannot write a grant or repair history"); },
    async list() { lists++; return new Map(); },
    async transaction(work) { return work(storage); },
  };
  const object = new ShopFulfillment({ storage });
  const namespace = { idFromName: () => "shop.561.group", get: () => ({
    fetch: (url, init) => object.fetch(new Request(url, init)),
  }) };
  const runtime = createDigitalGoodsStorefrontWorker({ catalog, origin: "https://shop.561.group",
    buyerActor: "urn:ame:shop-561-group-buyer" });
  const accounts = { clientId: "fixture-client", clientSecret: "fixture-client-secret", sessionSecret: "fixture-session-secret" };
  const cookie = createSessionCookie({ name: "storefront_session", subject: "fixture-reader", subjectHash: "fixture-hash",
    email: "reader@example.test", secret: accounts.sessionSecret, now: Date.now }).split(";")[0];
  const request = new Request("https://shop.561.group/private-host-read", { headers: { cookie } });
  const selection = { subscriptionId: "sub_unissued" };

  const separate = { fulfillment: createShopFulfillment(namespace), audit: createShopStripeAudit(namespace), accounts };
  assert.notEqual(separate.audit, separate.fulfillment.audit);
  assert.equal((await runtime.readSubscriptionOrder(request, selection, separate)).reason, "original-order-custody-unavailable");
  assert.equal(lists, 0, "the original provider refuses substituted custody before reading it");

  const paired = { ...createShopFulfillmentBindings(namespace), accounts };
  assert.equal(paired.audit, paired.fulfillment.audit);
  const received = await runtime.readSubscriptionOrder(request, selection, paired);
  assert.equal(received.type, "StorefrontSubscriptionOrderRefusal");
  assert.equal(received.reason, "signed-original-subscription-binding-required");
  assert.equal(lists, 1, "the paired binding reaches the original empty audit without inventing an order");
  assert.equal(rows.size, 0);
});
