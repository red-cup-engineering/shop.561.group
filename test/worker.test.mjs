import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import worker, { CATALOG, CATALOG_VALIDATION, ShopFulfillment, ORIGINAL_EXTERNAL_STRIPE_PAYMENT_LINK_IDS, EXTERNAL_STRIPE_PAYMENT_LINK_RECEIVER_INSTALLED } from "../src/worker.mjs";
import originalPublications from "#parameters/data/records/commerce-navigation/2026-10-20-original-publication-identities.json" with { type: "json" };
import {campaign} from "../src/support-campaign.mjs";

function fulfillment() {
  const rows = new Map();
  const storage = { async get(key) { return rows.get(key); }, async put(key, value) { rows.set(key, value); }, async transaction(work) { return work({ get: storage.get, put: storage.put }); } };
  const object = new ShopFulfillment({ storage });
  return {
    namespace: {
      idFromName() { return "shop"; },
      get() { return { fetch(input, init) { return object.fetch(input instanceof Request ? input : new Request(input, init)); } }; },
    },
    async post(path, body) { return object.fetch(new Request(`https://fulfillment${path}`, { method: "POST", body: JSON.stringify(body) })); },
    async entitlement(id) { return (await object.fetch(new Request(`https://fulfillment/entitlement/${id}`))).json(); },
  };
}
function env(overrides = {}) { return { SHOP_FULFILLMENT: fulfillment().namespace, SHOP_GOODS: { async get() { return null; }, async head() { return null; } }, SHOP_TOKEN_SECRET: "token-secret", ...overrides }; }
function signature(body, secret) { const now = Math.floor(Date.now() / 1000); return "t=" + now + ",v1=" + createHmac("sha256", secret).update(String(now) + "." + body).digest("hex"); }
function paidEvent({ eventId = "evt_test", sessionId = "cs_test", offeringId = "the-x402-economy", amount = 900, currency = "usd", paymentStatus = "paid" } = {}) {
  return { id: eventId, type: "checkout.session.completed", livemode: false, data: { object: { id: sessionId, amount_total: amount, currency, payment_status: paymentStatus, status: "complete", metadata: { offering_id: offeringId, request_digest: "digest" } } } };
}

test("the Shop's public catalog uses the shared Bazaar-readable seller projection", async () => {
  const url = "https://shop.561.group/catalog.json";
  const response = await worker.fetch(new Request(url), env());
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type").includes("application/json"));
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const publicReadout = await response.json();
  assert.deepEqual(new Set(publicReadout.offerings.map(({ id }) => id)), new Set(CATALOG.offerings.map(({ id }) => id)),
    "the Shop must preserve every original offer while prioritizing source-live books");
  assert.ok(publicReadout.offerings.slice(0, 8).every((offering) => offering.status === "live"),
    "the first eight Shop tiles are the existing source-live books");
  assert.equal(publicReadout.offerings[0].id, "the-x402-economy");
  assert.equal(publicReadout.merchant.name, CATALOG.merchant.name);
  assert.equal(publicReadout.merchant.name, "561 Group", "publisher brand must remain the original source");
  assert.equal(publicReadout.merchant.legalBody, "emsenn", "a proposed LLC must not be projected as the legal seller");
  assert.equal(CATALOG.merchant.legalBody, "emsenn", "the compiled merchant must agree with the buyer-facing receiver");
  assert.equal(Object.hasOwn(publicReadout.merchant, "privateKey"), false);
  for (const offered of publicReadout.offerings) {
    // Release approval and the runtime's card checkout admission are distinct:
    // public Bazaar buyers must not see a sale action this Worker cannot take.
    assert.equal(offered.buyable, false, offered.id);
    assert.equal(Object.hasOwn(offered, "line"), false, offered.id);
    if (offered.book) {
      assert.equal(Object.hasOwn(offered.book, "manuscript"), false, offered.id);
      assert.equal(Object.hasOwn(offered.book, "coverFile"), false, offered.id);
      assert.equal(Object.hasOwn(offered.book.edition ?? {}, "record"), false, offered.id);
      for (const file of offered.book.edition?.files ?? []) {
        assert.equal(Object.hasOwn(file, "path"), false, offered.id);
      }
    }
  }
  const original = CATALOG.offerings.find(({ id }) => id === "the-x402-economy");
  const published = publicReadout.offerings.find(({ id }) => id === "the-x402-economy");
  assert.equal(published.agentOfferUrl, original.agentOfferUrl);
  assert.equal(published.book.edition.files[0].sha256, original.book.edition.files[0].sha256);

  const head = await worker.fetch(new Request(url, { method: "HEAD" }), env());
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("access-control-allow-origin"), "*");
  assert.equal(await head.text(), "");
  const options = await worker.fetch(new Request(url, { method: "OPTIONS" }), env());
  assert.equal(options.status, 204);
  assert.match(options.headers.get("access-control-allow-methods"), /GET, HEAD, OPTIONS/u);
  const refused = await worker.fetch(new Request(url, { method: "POST" }), env());
  assert.equal(refused.status, 405);
  assert.equal(refused.headers.get("allow"), "GET, HEAD, OPTIONS");
});

test("the shop lists human publications and merch without presenting unaccepted books as live", () => {
  assert.equal(CATALOG_VALIDATION.valid, true);
  for (const offering of CATALOG.offerings) assert.ok(offering.book || offering.line === "merch" || offering.line === "@561-group/health-education-newsletter-services-section", offering.id);
  for (const offering of CATALOG.offerings.filter((item) => item.book)) {
    if (offering.status === "live") assert.ok(offering.book.edition.acceptedAt, offering.id);
    else assert.equal(offering.status, "coming-soon", offering.id);
    assert.match(offering.release, /^[a-z0-9-]+$/u, offering.id);
    if (offering.agentOfferUrl) {
      assert.equal(offering.status, "live", "a coming-soon publication cannot advertise a paid Market listing");
      const destination = new URL(offering.agentOfferUrl);
      const original = originalPublications.offers.find((item) => item.operation === offering.release);
      assert.ok(original, offering.id);
      assert.equal(destination.origin, "https://bazaar.561.group", offering.id);
      assert.equal(destination.pathname, "/offers", offering.id);
      assert.equal(destination.hash, "", offering.id);
      assert.deepEqual([...destination.searchParams.keys()], ["source", "id"], offering.id);
      assert.equal(destination.searchParams.get("source"), "house-x402", offering.id);
      assert.equal(destination.searchParams.get("id"), original.sku, "Bazaar inspects the seller’s exact original operation identity");
    }
    assert.ok(offering.book.contents.length > 0, offering.id);
    for (const file of offering.book.edition.files) assert.match(file.sha256, /^[0-9a-f]{64}$/u, `${offering.id} ${file.format}`);
  }
  const newsletter = CATALOG.offerings.find((offering) => offering.id === "health-education-newsletter");
  assert.equal(newsletter.status, "coming-soon");
  assert.equal(newsletter.externalUrl, undefined);
  assert.ok(!CATALOG.offerings.some((offering) => /bindinggenerations|play\.561|\/v1\//u.test(offering.externalUrl ?? "")));
});

test("the catalog and a book page render through TUFTE with the verification record", async () => {
  const listing = await (await worker.fetch(new Request("https://shop.561.group/"), env())).text();
  assert.match(listing, /561 Group Books/);
  assert.match(listing, /href="\/goods\/the-x402-economy"/);
  const page = await (await worker.fetch(new Request("https://shop.561.group/goods/the-x402-economy"), env())).text();
  assert.match(page, /Verification record/);
  assert.match(page, /property="og:image" content="https:\/\/shop.561.group\/covers\/the-x402-economy.png"/);
  assert.match(page, /Card checkout opens soon/);
  assert.match(page, /Explore x402 offer/);
  assert.match(page, /https:\/\/bazaar\.561\.group\/offers\?source=house-x402&amp;id=ni%3A%2F%2F%2Fsha-256%3B-2a0jEZ7cWENXeYPs3xdboD6wd_xuNqgL1wVbZqQDK4/u);
});

test("checkout remains unavailable without all payment capabilities", async () => {
  const response = await worker.fetch(new Request("https://shop.561.group/checkout/the-x402-economy", { method: "POST", headers: { origin: "https://shop.561.group" } }), env());
  assert.equal(response.status, 409);
});

test("webhook requires a paid event joined to the issued checkout", async () => {
  const secret = "whsec_test"; const store = fulfillment(); const runtime = env({ SHOP_FULFILLMENT: store.namespace, STRIPE_WEBHOOK_SECRET: secret });
  await store.post("/checkout", { sessionId: "cs_test", offeringId: "the-x402-economy", requestDigest: "digest", amountTotal: 900, currency: "usd", stripeMode: "test", release: "the-x402-economy" });
  const unpaid = JSON.stringify(paidEvent({ eventId: "evt_pending", paymentStatus: "unpaid" }));
  const pending = await worker.fetch(new Request("https://shop.561.group/webhooks/stripe", { method: "POST", body: unpaid, headers: { "stripe-signature": signature(unpaid, secret) } }), runtime);
  assert.equal(pending.status, 200);
  assert.deepEqual(await pending.json(), { accepted: true, pending: true });
  assert.equal(await store.entitlement("cs_test"), null);
  const mismatch = JSON.stringify(paidEvent({ eventId: "evt_mismatch", amount: 1 }));
  assert.equal((await worker.fetch(new Request("https://shop.561.group/webhooks/stripe", { method: "POST", body: mismatch, headers: { "stripe-signature": signature(mismatch, secret) } }), runtime)).status, 409);
  const body = JSON.stringify(paidEvent());
  assert.equal((await worker.fetch(new Request("https://shop.561.group/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": signature(body, secret) } }), runtime)).status, 200);
  assert.equal((await worker.fetch(new Request("https://shop.561.group/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": signature(body, secret) } }), runtime)).status, 200);
  assert.equal((await store.entitlement("cs_test")).status, "active");
});

test("sign-in and gifts stay closed until the shop's Google client and session secret are set", async () => {
  const listing = await (await worker.fetch(new Request("https://shop.561.group/"), env())).text();
  assert.doesNotMatch(listing, /Sign in/);
  assert.equal((await worker.fetch(new Request("https://shop.561.group/library"), env())).status, 503);
  const open = env({ GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", SHOP_SESSION_SECRET: "session", SHOP_GIFTERS: "giver@example.test" });
  const login = await worker.fetch(new Request("https://shop.561.group/oauth/login?return_to=/library"), open);
  assert.equal(login.status, 302);
  assert.match(login.headers.get("location"), /redirect_uri=https%3A%2F%2Fshop.561.group%2Foauth%2Fcallback/);
});


test('source-owned Shop offers public read-only product discovery over the original MCP transport', async () => {
  const origin = 'https://shop.561.group';
  const request = (method, params) => new Request(origin + '/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  });
  const readout = await (await worker.fetch(new Request(origin + '/catalog.json'), env())).json();
  const list = await worker.fetch(request('tools/list'), env());
  assert.equal(list.status, 200);
  const names = (await list.json()).result.tools.map(tool => tool.name);
  assert.deepEqual(names, ['list_products', 'search_products', 'get_product']);

  const detail = await worker.fetch(request('tools/call', {
    name: 'get_product', arguments: { id: 'the-x402-economy' },
  }), env());
  assert.equal(detail.status, 200);
  const product = (await detail.json()).result.structuredContent;
  const original = readout.offerings.find(item => item.id === 'the-x402-economy');
  assert.equal(product.id, original.id);
  assert.equal(product.url, origin + '/goods/the-x402-economy');
  assert.equal(product.buyable, false, 'unconfigured card checkout cannot become agent-buyable');
  assert.equal(product.agentOfferUrl, original.agentOfferUrl);
  assert.equal(product.book.edition.files[0].sha256, original.book.edition.files[0].sha256);
  assert.equal(Object.hasOwn(product, 'line'), false);
  assert.equal(Object.hasOwn(product.book, 'manuscript'), false);
  assert.equal(Object.hasOwn(product.book.edition.files[0], 'path'), false);

  const found = await worker.fetch(request('tools/call', {
    name: 'search_products', arguments: { query: 'x402' },
  }), env());
  const matches = (await found.json()).result.structuredContent.products;
  assert.ok(matches.some(item => item.id === 'the-x402-economy'));
  const unauthorized = await worker.fetch(new Request(origin + '/mcp', {
    method: 'POST', headers: {
      'content-type': 'application/json', origin: 'https://other.example',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  }), env());
  assert.equal(unauthorized.status, 403);
  assert.equal((await worker.fetch(new Request(origin + '/mcp'), env())).status, 405);
});

test("original Shop serves accepted-only Atom and advertises its reader entrance", async () => {
  const feed = await worker.fetch(new Request("https://shop.561.group/books.atom"), env());
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type"), /application\/atom\+xml/u);
  assert.equal(feed.headers.get("x-content-type-options"), "nosniff");
  const xml = await feed.text();
  assert.match(xml, /\/goods\/the-x402-economy/u);
  assert.doesNotMatch(xml, /\/goods\/the-agent-operators-handbook/u);
  const head = await worker.fetch(new Request("https://shop.561.group/books.atom", {method:"HEAD"}), env());
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await worker.fetch(new Request("https://shop.561.group/books.atom", {method:"POST"}), env());
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  const home = await (await worker.fetch(new Request("https://shop.561.group/"), env())).text();
  assert.match(home, /books\.atom/u);
});

test("Shop routes original market services without mutating book checkout", async () => {
  const sku = "ni:///sha-256;" + "G".repeat(43);
  const source = { recordType: "561-group.x402-market-catalog",
    market: "https://market.561.group", settlement: { protocol: "x402" },
    offers: [
      { sku, name: "Verification service", listed: true, method: "POST",
        url: "https://market.561.group/v1/verify", price: "$0.02",
        description: "Source-qualified typed validation", request: { bodySchema: { type: "object" } } },
      { sku: "ni:///sha-256;" + "H".repeat(43), name: "held", listed: false },
    ] };
  let reads = 0;
  const testEnv = env({ MARKET_SERVICE_CATALOG_FETCH: async (url, options) => {
    reads++;
    assert.equal(url, "https://market.561.group/v1/catalog?offset=0&limit=20");
    assert.equal(options.redirect, "manual");
    return Response.json(source);
  } });
  const machine = await worker.fetch(new Request("https://shop.561.group/services.json"), testEnv);
  assert.equal(machine.status, 200);
  const projection = await machine.json();
  assert.equal(projection.total, 1);
  assert.equal(projection.services[0].sku, sku);
  assert.equal(projection.services[0].shopCheckoutAvailable, false);
  const html = await worker.fetch(new Request("https://shop.561.group/services"), testEnv);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Verification service/u);
  assert.equal(reads, 2);
  const fromMarketBinding = env({ MARKET_SERVICE_CATALOG_FETCH: {
    async fetch(request) {
      assert.equal(request.url, "https://market.561.group/v1/catalog?offset=0&limit=20");
      assert.equal(request.method, "GET");
      assert.equal(request.credentials, "omit");
      return Response.json(source);
    },
  } });
  const viaBinding = await worker.fetch(new Request("https://shop.561.group/services.json"), fromMarketBinding);
  assert.equal(viaBinding.status, 200);
  assert.equal((await viaBinding.json()).services[0].sku, sku);
  assert.match(await (await worker.fetch(new Request("https://shop.561.group/sitemap.xml"), testEnv)).text(),
    /shop\.561\.group\/services/u);
  const originalGoods = await (await worker.fetch(new Request("https://shop.561.group/catalog.json"), testEnv)).json();
  assert.equal(originalGoods.offerings.length, CATALOG.offerings.length);
});



test('real Shop Worker audits every source-qualified support checkout without creating Group book-sale entitlements',async()=>{
 const known=[campaign.monthly.id,...Object.values(campaign.oneTime.links).map(link=>link.id)];
 assert.deepEqual(ORIGINAL_EXTERNAL_STRIPE_PAYMENT_LINK_IDS,known);
 assert.equal(new Set(known).size,4);
 assert.equal(typeof EXTERNAL_STRIPE_PAYMENT_LINK_RECEIVER_INSTALLED,'boolean');
 const f=fulfillment(),secret='offline-source-observation-test';
 const injected=env({SHOP_FULFILLMENT:f.namespace,STRIPE_WEBHOOK_SECRET:secret});
 for(const [index,linkId] of known.entries()){
  // Synthetic test-only provider events: no Stripe mutation, actual buyer or money.
  const record={
   id:'evt_external_support_shop_'+index,type:'checkout.session.completed',
   livemode:false,created:1792670000+index,
   data:{object:{
    id:'cs_external_support_shop_'+index,
    payment_link:linkId,
    payment_status:'paid',status:'complete',amount_total:1000,currency:'usd',
    customer_details:{email:'private-payment-buyer@example.invalid'}
   }}
  };
  const raw=JSON.stringify(record);
  const send=()=>worker.fetch(new Request('https://shop.561.group/webhooks/stripe',{
   method:'POST',body:raw,headers:{'stripe-signature':signature(raw,secret)}
  }),injected);
  const response=await send();
  assert.equal(response.status,EXTERNAL_STRIPE_PAYMENT_LINK_RECEIVER_INSTALLED?200:409,linkId);
  if(EXTERNAL_STRIPE_PAYMENT_LINK_RECEIVER_INSTALLED){
   const body=await response.json();
   assert.equal(body.externalCheckoutObserved,true);
   assert.equal(body.settlement,'not-established');
   const repeated=await send();
   assert.deepEqual(await repeated.json(),{
    accepted:true,externalCheckoutObserved:true,duplicate:true,
    settlement:'not-established'
   });
  }else{
   assert.equal((await response.json()).error,'payment-does-not-match-checkout-intent',
    'the installed supplier must not pretend it observed a hosted-support link');
  }
  assert.equal(await f.entitlement(record.data.object.id),null,
   'a personal tip never grants a corporate book entitlement');
 }
 const listing=await (await worker.fetch(new Request('https://shop.561.group/catalog.json'),injected)).json();
 assert.equal('externalStripePaymentLinkReceivers' in listing,false,
  'merchant audit source configuration must not leak through public merchandise discovery');
 for(const offered of listing.offerings)
  assert.equal('stripePaymentLinkId' in offered,false);
});
