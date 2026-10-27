import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKET_CATALOG_URL, marketCatalogTransport, projectOriginalMarketServices, renderServiceBrowse, serviceBrowseResponse
} from "../src/service-discovery.mjs";

const a = "ni:///sha-256;" + "A".repeat(43);
const b = "ni:///sha-256;" + "B".repeat(43);
const hidden = "ni:///sha-256;" + "C".repeat(43);
function row(sku, name, listed = true) {
  return {
    sku, name, listed, gateway: "typed-compute", operation: "example",
    category: "data", method: "POST", route: "/v1/example",
    url: "https://market.561.group/v1/example",
    description: "Reliable & <script>not markup</script> validation",
    seller: { enterprise: "561 Group's actual original provider" }, price: "$0.02",
    cell: "ni:///sha-256;" + "D".repeat(43), law: "ni:///sha-256;" + "E".repeat(43),
    request: { bodySchema: { type: "object", required: ["text"] } },
    output: { schema: { type: "object", properties: { digest: { type: "string" } } } },
    sourceRightsVerification: "not-declared",
    secretNeverProject: "do-not-publish",
  };
}
function source() {
  return { recordType: "561-group.x402-market-catalog", market: "https://market.561.group",
    settlement: { protocol: "x402", network: "eip155:8453", asset: "USDC" },
    offers: [row(a, "Alpha & API"), row(b, "Beta API"), row(hidden, "Not for sale", false)] };
}
function served(doc = source()) {
  return async (url, options) => {
    assert.equal(new URL(url).origin + new URL(url).pathname, MARKET_CATALOG_URL);
    assert.ok(new URL(url).searchParams.has("limit"));
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    return new Response(JSON.stringify(doc), {
      status: 200, headers: { "content-type": "application/json", "cache-control": "no-cache" }
    });
  };
}

test("source-owned seller readout stays one seller, one SKU and no Shop payment assertion", () => {
  const projected = projectOriginalMarketServices(source());
  assert.equal(projected.recordType, "561-group.shop.source-service-discovery.v1");
  assert.equal(projected.source.catalog, MARKET_CATALOG_URL);
  assert.equal(projected.total, 2);
  assert.deepEqual(projected.services.map(x => x.sku), [a, b]);
  assert.equal(projected.services[0].pricePreview, "$0.02");
  assert.equal(projected.services[0].input.bodySchema.required[0], "text");
  assert.equal(projected.services[0].seller.enterprise, "561 Group's actual original provider");
  assert.equal(projected.services[0].shopCheckoutAvailable, false);
  assert.equal(projected.services[0].externalPaidDeliveryVerified, false);
  assert.equal(projected.services[0].inspectUrl,
    "https://bazaar.561.group/offers?source=house-x402&id=" + encodeURIComponent(a));
  assert.equal(projected.services[1].inspectUrl,
    "https://bazaar.561.group/offers?source=house-x402&id=" + encodeURIComponent(b));
  assert.equal(JSON.stringify(projected).includes("https://market.561.group/?offer="), false);
  assert.equal(JSON.stringify(projected).includes("secretNeverProject"), false);
  assert.equal(JSON.stringify(projected).includes(hidden), false);
});

test("public seller projection strips private fields in both JSON and HTML", async () => {
  const original = source();
  original.offers[0].seller.internalToken = "private-seller-token";
  original.offers[0].seller.payout = { accountNumber: "private-bank-data" };
  original.offers[1].seller = { payout: { accountNumber: "private-only" } };
  const projected = projectOriginalMarketServices(original);
  assert.deepEqual(projected.services[0].seller, {
    enterprise: "561 Group's actual original provider",
  });
  assert.equal(projected.services[1].seller, null,
    "a seller with no public enterprise identity cannot export unknown private fields");
  for (const leaked of ["private-seller-token", "private-bank-data", "private-only"]) {
    assert.equal(JSON.stringify(projected).includes(leaked), false);
    assert.equal(renderServiceBrowse(projected).includes(leaked), false);
  }
  const json = await serviceBrowseResponse(
    new Request("https://shop.561.group/services.json"), { fetchSource: served(original) }
  );
  assert.equal(json.status, 200);
  const machine = await json.json();
  assert.deepEqual(machine.services[0].seller, projected.services[0].seller);
  assert.equal(machine.services[1].seller, null);
  for (const leaked of ["private-seller-token", "private-bank-data", "private-only"])
    assert.equal(JSON.stringify(machine).includes(leaked), false);
});

test("search and paging select existing identities without inventing catalog rows", () => {
  assert.deepEqual(projectOriginalMarketServices(source(), { query: "beta", limit: 1 })
    .services.map(x => x.sku), [b]);
  const first = projectOriginalMarketServices(source(), { limit: 1 });
  assert.equal(first.nextOffset, 1);
  const second = projectOriginalMarketServices(source(), { offset: 1, limit: 1 });
  assert.deepEqual(second.services.map(x => x.sku), [b]);
  assert.equal(second.nextOffset, null);
  assert.equal(projectOriginalMarketServices(source(), { query: "nothing" }).total, 0);
});

test("service cards HTML-escape seller descriptions and do not make a fake buy button", () => {
  const html = renderServiceBrowse(projectOriginalMarketServices(source()));
  assert.match(html, /&amp; &lt;script&gt;not markup&lt;\/script&gt;/u);
  assert.doesNotMatch(html, /<script>/u);
  assert.match(html, /owning service section/u);
  assert.doesNotMatch(html, /<form[^>]*checkout/u);
  assert.match(html, /bazaar\.561\.group\/offers\?source=house-x402&amp;id=/u);
  assert.match(html, /Inspect input, output and buying options in the Shop/u);
  assert.match(html, /\/services\/offer\?sku=ni%3A%2F%2F%2Fsha-256%3B/u);
  assert.doesNotMatch(html, /market\.561\.group\/\?offer=/u);
});

test("HTTP routes serve source-described machine data and semantic human browse", async () => {
  const get = await serviceBrowseResponse(new Request("https://shop.561.group/services.json?q=alpha"), { fetchSource: served() });
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("access-control-allow-origin"), "*");
  assert.equal(get.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal((await get.json()).services[0].sku, a);
  const human = await serviceBrowseResponse(new Request("https://shop.561.group/services"), { fetchSource: served() });
  assert.equal(human.status, 200);
  assert.match(human.headers.get("content-security-policy"), /default-src 'none'/u);
  assert.match(await human.text(), /Machine-readable service catalog/u);
  const head = await serviceBrowseResponse(new Request("https://shop.561.group/services.json", { method: "HEAD" }), { fetchSource: served() });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("search rejects abuse before contacting seller; writes never become purchase actions", async () => {
  const noSource = async () => { throw new Error("invalid query reached market"); };
  assert.equal((await serviceBrowseResponse(
    new Request("https://shop.561.group/services?q=" + "a".repeat(121)), { fetchSource: noSource })).status, 400);
  assert.equal((await serviceBrowseResponse(
    new Request("https://shop.561.group/services?limit=1000"), { fetchSource: noSource })).status, 400);
  const post = await serviceBrowseResponse(new Request("https://shop.561.group/services", { method: "POST" }), { fetchSource: noSource });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("mismatched source identity, duplicate NI, secret origin and held products refuse", () => {
  const fakeMarket = source(); fakeMarket.market = "https://another.merchant";
  assert.throws(() => projectOriginalMarketServices(fakeMarket), /source-owned/u);
  const dupe = source(); dupe.offers.push(row(a, "duplicate"));
  assert.throws(() => projectOriginalMarketServices(dupe), /duplicate/u);
  const otherOrigin = source(); otherOrigin.offers[0].url = "https://evil.example/charges";
  assert.throws(() => projectOriginalMarketServices(otherOrigin), /outside/u);
  const heldOnly = source(); heldOnly.offers = [row(hidden, "not listed", false)];
  assert.equal(projectOriginalMarketServices(heldOnly).total, 0);
});

test("streamed Market catalog is bounded before buffering and cancels oversized reads", async () => {
  let cancelled = false;
  let sent = 0;
  const chunk = new Uint8Array(1_000_000);
  const oversized = new ReadableStream({
    pull(controller) {
      if (++sent <= 10) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const failed = await serviceBrowseResponse(
    new Request("https://shop.561.group/services.json"),
    { fetchSource: async () => new Response(oversized, {
      status: 200, headers: { "content-type": "application/json", "content-length": "15" }
    }) }
  );
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error, "Source-qualified service catalog temporarily unavailable");
  assert.equal(cancelled, true, "oversized streaming bodies must be cancelled instead of being fully read");
  assert.ok(sent <= 6, "only a bounded number of chunks may be read");

  const encoded = new TextEncoder().encode(JSON.stringify(source()));
  const valid = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded.slice(0, 17));
      controller.enqueue(encoded.slice(17));
      controller.close();
    }
  });
  const accepted = await serviceBrowseResponse(
    new Request("https://shop.561.group/services.json"),
    { fetchSource: async () => new Response(valid, { headers: { "content-type": "application/json" } }) }
  );
  assert.equal(accepted.status, 200, "ordinary chunked catalog reads must still work");
  assert.equal((await accepted.json()).total, 2);
});

test("shop does not report zero inventory or leak state when merchant response is bad", async () => {
  for (const fetchSource of [
    async () => new Response("down", { status: 503, headers: { "content-type": "text/plain" } }),
    async () => new Response("redirect", { status: 302, headers: { location: "https://evil.example" } }),
    async () => new Response("{bad", { status: 200, headers: { "content-type": "application/json" } }),
    served({ recordType: "incorrect", market: "https://market.561.group", offers: [] }),
  ]) {
    const out = await serviceBrowseResponse(new Request("https://shop.561.group/services.json"), { fetchSource });
    assert.equal(out.status, 503);
    assert.equal(out.headers.get("cache-control"), "no-store");
    const data = await out.json();
    assert.match(data.error, /temporarily unavailable/u);
    assert.equal(data.source, MARKET_CATALOG_URL);
  }
});

test("service browsing preserves page size and exposes accessible forward, back and empty results", () => {
  const first = renderServiceBrowse(projectOriginalMarketServices(source(), { query: "api", limit: 1 }));
  assert.match(first, /<nav aria-label="Service results pages">/u);
  assert.match(first, /<a rel="next" href="\/services\?q=api&amp;offset=1&amp;limit=1">More services<\/a>/u);
  assert.match(first, /<input type="hidden" name="limit" value="1">/u);
  assert.doesNotMatch(first, /Previous services/u);

  const second = renderServiceBrowse(projectOriginalMarketServices(source(), { query: "api", offset: 1, limit: 1 }));
  assert.match(second, /<a rel="prev" href="\/services\?q=api&amp;offset=0&amp;limit=1">Previous services<\/a>/u);
  assert.doesNotMatch(second, /More services/u);

  const beyond = renderServiceBrowse(projectOriginalMarketServices(source(), { offset: 500, limit: 1 }));
  assert.match(beyond, /No services at this page offset/u);
  assert.match(beyond, /<a rel="prev" href="\/services\?q=&amp;offset=1&amp;limit=1">Previous services<\/a>/u);
  const missing = renderServiceBrowse(projectOriginalMarketServices(source(), { query: "nothing" }));
  assert.match(missing, /<p role="status">No matching services\.<\/p>/u);
  assert.doesNotMatch(missing, /Service results pages/u);
});

test("HTTP service browser keeps exact page parameters and returns a useful no-match status", async () => {
  const response = await serviceBrowseResponse(
    new Request("https://shop.561.group/services?q=api&offset=1&limit=1"),
    { fetchSource: served() }
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<a rel="prev" href="\/services\?q=api&amp;offset=0&amp;limit=1">Previous services<\/a>/u);
  assert.match(html, /<input type="hidden" name="limit" value="1">/u);
  const empty = await serviceBrowseResponse(
    new Request("https://shop.561.group/services?q=no-such-offer"),
    { fetchSource: served() }
  );
  assert.match(await empty.text(), /<p role="status">No matching services\.<\/p>/u);
});

test("original Market service binding sends one fixed read request, without purchase rights", async () => {
  const calls = [];
  const transport = marketCatalogTransport({
    async fetch(request) {
      calls.push(request);
      assert.equal(new URL(request.url).origin + new URL(request.url).pathname, MARKET_CATALOG_URL);
      assert.equal(new URL(request.url).searchParams.get("query"), "alpha");
      assert.equal(request.method, "GET");
      assert.equal(request.redirect, "manual");
      assert.equal(request.credentials, "omit");
      assert.equal(request.headers.get("accept"), "application/json");
      return Response.json(source());
    },
  }, async () => { throw Error("service binding bypassed"); });
  const response = await serviceBrowseResponse(
    new Request("https://shop.561.group/services.json?q=alpha"), { fetchSource: transport }
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 1);
  assert.equal(calls.length, 1);
  const malformed = marketCatalogTransport({ fetch: true },
    async () => { throw Error("must not use fallback for a broken binding"); });
  const refused = await serviceBrowseResponse(
    new Request("https://shop.561.group/services.json"), { fetchSource: malformed }
  );
  assert.equal(refused.status, 503);
  assert.equal((await refused.json()).error, "Source-qualified service catalog temporarily unavailable");
});

test("the original Shop Wrangler declaration selects the actual Market Worker", async () => {
  const { readFile } = await import("node:fs/promises");
  const manifest = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(manifest, /"binding": "MARKET_SERVICE_CATALOG_FETCH", "service": "market-561-group"/u);
});

test("large catalogs are browsed through one bounded original Market page", async () => {
  let calls = 0;
  const page = { ...source(), offers: source().offers.slice(0, 2),
    total: 10000, offset: 9800, limit: 2, nextOffset: 9802 };
  const response = await serviceBrowseResponse(
    new Request("https://shop.561.group/services.json?q=api&offset=9800&limit=2"),
    { fetchSource: async (address, options) => {
      calls += 1;
      const url = new URL(address);
      assert.equal(url.origin + url.pathname, MARKET_CATALOG_URL);
      assert.equal(url.searchParams.get("query"), "api");
      assert.equal(url.searchParams.get("offset"), "9800");
      assert.equal(url.searchParams.get("limit"), "2");
      assert.equal(options.credentials, "omit");
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json(page);
    } }
  );
  assert.equal(response.status, 200);
  const projected = await response.json();
  assert.equal(projected.total, 10000);
  assert.equal(projected.nextOffset, 9802);
  assert.deepEqual(projected.services.map(row => row.sku), [a, b]);
  assert.equal(calls, 1);
});

test("section forms and navigation preserve the same source selection", async () => {
  const section = "lib/emsenn/services/561-group/services/data-services-section";
  const offer = { ...row(a, "Section service"), section };
  const page = { ...source(), offers: [offer], total: 4, offset: 1, limit: 1, nextOffset: 2 };
  const params = new URLSearchParams({ q: "analysis", section, cover: section, offset: "1", limit: "1" });
  const response = await serviceBrowseResponse(new Request(`https://shop.561.group/services?${params}`), {
    fetchSource: async address => {
      const url = new URL(address);
      assert.equal(url.searchParams.get("section"), section);
      assert.equal(url.searchParams.get("cover"), section);
      return Response.json(page);
    },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /2–2 of 4 matching services/u);
  assert.match(html, /name="section"/u);
  assert.match(html, /name="cover"/u);
  assert.match(html, /More from data/u);
  assert.match(html, /rel="next"[^>]+section=[^&]+&amp;cover=/u);
  assert.doesNotMatch(html, /independently proven|unverified|No purchase or wallet authority/u);
});

test("mismatched or incomplete upstream pages cannot become customer results", async () => {
  const good = { ...source(), offers: source().offers.slice(0, 2), total: 10000,
    offset: 700, limit: 2, nextOffset: 702 };
  for (const changed of [
    { offset: 0 }, { limit: 20 }, { total: -1 }, { nextOffset: null },
    { offers: [good.offers[0]] }, { offers: [good.offers[0], row(b, "Held", false)] },
  ]) {
    const response = await serviceBrowseResponse(
      new Request("https://shop.561.group/services.json?offset=700&limit=2"),
      { fetchSource: async () => Response.json({ ...good, ...changed }) }
    );
    assert.equal(response.status, 503);
  }
});

test("invalid page and section requests remain client errors", async () => {
  for (const query of ["offset=1e3", "offset=100001", "q=a&q=b", "unknown=yes"])
    assert.equal((await serviceBrowseResponse(new Request(`https://shop.561.group/services?${query}`), {
      fetchSource: async () => { throw Error("invalid selection contacted Market"); },
    })).status, 400);
  const response = await serviceBrowseResponse(new Request("https://shop.561.group/services?cover=bad"), {
    fetchSource: async () => Response.json({ error: "Invalid source section cover" }, { status: 400 }),
  });
  assert.equal(response.status, 400);
});
