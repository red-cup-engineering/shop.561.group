import {MAX_ORIGINAL_MARKET_BYTES, readBoundedOriginalMarketJson} from "./original-market-reader.mjs";
import {serviceCompareResponse} from "./service-comparison.mjs";
// Read-only human and machine storefront projection of the ORIGINAL x402 seller.
// Shop does not become another merchant, invent prices or accept agent payment here.
export const MARKET_CATALOG_URL = "https://market.561.group/v1/catalog";
export function marketCatalogTransport(binding, publicFetch = fetch) {
  if (binding == null) return publicFetch;
  if (typeof binding === "function") return binding;
  if (typeof binding.fetch !== "function") {
    return async () => { throw new TypeError("Market binding unavailable"); };
  }
  return (url, options) => binding.fetch(new Request(url, { ...options, credentials: "omit" }));
}
const MARKET_ORIGIN = "https://market.561.group";
// The Bazaar source declaration names this original seller as house-x402.
// A source-qualified inspection link neither reissues its offer nor pays for it.
const BAZAAR_SOURCE_OFFER_URL = "https://bazaar.561.group/offers?source=house-x402&id=";
const MAX_UPSTREAM_BYTES = MAX_ORIGINAL_MARKET_BYTES;
const MAX_LEGACY_LISTED = 500;
const MAX_OFFSET = 100000;
const MAX_PAGE = 50;

function sourceIdentity(row) {
  if (!row || typeof row !== "object" || Array.isArray(row) ||
      typeof row.sku !== "string" ||
      !/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(row.sku) ||
      typeof row.name !== "string" || !row.name.trim() ||
      !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(row.method) ||
      typeof row.url !== "string")
    throw new TypeError("Market supplied an invalid listed offer");
  let original;
  try { original = new URL(row.url); } catch { throw new TypeError("Market offer has no usable origin"); }
  if (original.origin !== MARKET_ORIGIN || original.username || original.password)
    throw new TypeError("Market listed an offer outside its original seller");
  return row.sku;
}

function selector(options = {}) {
  const query = options.query ?? "";
  const offset = options.offset ?? 0, limit = options.limit ?? 20;
  if (typeof query !== "string" || query.length > 120 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE)
    throw new TypeError("Service browsing requires a bounded query, offset and limit");
  const terms = [...new Set(query.trim().toLowerCase().split(/\s+/u).filter(Boolean))];
  if (terms.length > 8) throw new TypeError("Service query has too many terms");
  const section = options.section, cover = options.cover;
  for (const value of [section, cover]) {
    if (value !== undefined && (typeof value !== "string" || !value.length || value.length > 1024))
      throw new TypeError("Service section must be a bounded original path");
  }
  return { query, terms, offset, limit, section, cover };
}

export function marketServicePageUrl(options = {}) {
  const { query, offset, limit, section, cover } = selector(options);
  const url = new URL(MARKET_CATALOG_URL);
  if (query) url.searchParams.set("query", query);
  if (section !== undefined) url.searchParams.set("section", section);
  if (cover !== undefined) url.searchParams.set("cover", cover);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  return url.href;
}

/** This does not advertise Shop checkout, accept a price as payable, or restate a seller grant. */
export function projectOriginalMarketServices(source, options = {}) {
  const { query, terms, offset, limit, section, cover } = selector(options);
  const pageFields = ["total", "offset", "limit", "nextOffset"];
  const paged = source != null && pageFields.some(key => Object.hasOwn(source, key));
  if (!source || source.recordType !== "561-group.x402-market-catalog" ||
      source.market !== MARKET_ORIGIN || source.settlement?.protocol !== "x402" ||
      !Array.isArray(source.offers) || source.offers.length > (paged ? limit : MAX_LEGACY_LISTED))
    throw new TypeError("Shop requires the source-owned 561 Group x402 seller readout");
  if (paged && (!pageFields.every(key => Object.hasOwn(source, key)) ||
      !Number.isSafeInteger(source.total) || source.total < 0 ||
      source.offset !== offset || source.limit !== limit ||
      source.nextOffset !== (offset + limit < source.total ? offset + limit : null) ||
      source.offers.length !== Math.min(limit, Math.max(0, source.total - offset))))
    throw new TypeError("Market returned a mismatched service page");
  const listed = source.offers.filter(row => row?.listed === true);
  if (paged && listed.length !== source.offers.length)
    throw new TypeError("Market page contains an unavailable service");
  const identities = listed.map(sourceIdentity);
  if (new Set(identities).size !== identities.length)
    throw new TypeError("Original Market seller contains duplicate listed identities");
  const matching = listed.filter(row => {
    if (section !== undefined && row.section !== section) return false;
    if (cover !== undefined && !(row.section === cover || row.section?.startsWith(cover + "/"))) return false;
    // Search and pagination belong to the original Market. A legacy response
    // can be projected locally during the rolling deployment, within its cap.
    if (paged) return true;
    const haystack = [row.sku, row.name, row.description, row.category,
      row.gateway, row.operation, row.method, row.section, row.seller?.enterprise,
      row.compute?.package].map(v => String(v ?? "").toLowerCase()).join(" ");
    return terms.every(term => haystack.includes(term));
  });
  if (paged && matching.length !== listed.length)
    throw new TypeError("Market page differs from the requested service section");
  const total = paged ? source.total : matching.length;
  const selected = paged ? matching : matching.slice(offset, offset + limit);
  return Object.freeze({
    recordType: "561-group.shop.source-service-discovery.v1",
    source: Object.freeze({ catalog: MARKET_CATALOG_URL, market: source.market,
      readoutType: source.recordType, settlementProtocol: source.settlement.protocol }),
    qualifications: Object.freeze({
      listing: "original-seller-declared, not independently proven payable or delivered",
      checkout: "Shop read-only; current x402 quote and payment remain with original Market",
    }),
    query, ...(section === undefined ? {} : { section }), ...(cover === undefined ? {} : { cover }),
    total, offset, limit,
    nextOffset: offset + limit < total ? offset + limit : null,
    services: Object.freeze(selected.map(row => Object.freeze({
      sku: row.sku, name: row.name, description: row.description ?? "",
      category: row.category ?? "unclassified", gateway: row.gateway,
      ...(typeof row.section === "string" ? { section: row.section } : {}),
      operation: row.operation, method: row.method, endpoint: row.url,
      pricePreview: typeof row.price === "string" ? row.price : null,
      // Publicly project an explicit seller identity, never upstream private metadata.
      seller: typeof row.seller?.enterprise === "string" && row.seller.enterprise.trim()
        ? Object.freeze({ enterprise: row.seller.enterprise }) : null,
      cell: row.cell ?? null, law: row.law ?? null,
      input: row.request ?? null, output: row.output ?? null,
      sourceRightsVerification: row.sourceRightsVerification ?? "not-declared",
      inspectUrl: BAZAAR_SOURCE_OFFER_URL + encodeURIComponent(row.sku),
      listed: true, shopCheckoutAvailable: false,
      externalPaidDeliveryVerified: false,
    }))),
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

export function renderServiceBrowse(projection) {
  const { query, offset, limit, nextOffset, total, services, section, cover } = projection;
  const parameters = target => {
    const params = new URLSearchParams([
      ["q", query], ["offset", String(target)], ["limit", String(limit)]
    ]);
    if (section !== undefined) params.set("section", section);
    if (cover !== undefined) params.set("cover", cover);
    return params;
  };
  const form = `<form action="/services" method="GET" role="search"><label for="service-query">Find a service</label> <input id="service-query" name="q" value="${escapeHtml(query)}" maxlength="120" placeholder="What do you need to do?"> <input type="hidden" name="limit" value="${limit}"> <button type="submit">Search</button><details${section || cover ? " open" : ""}><summary>Browse a service section</summary><p><label for="service-section">Exact section</label><input id="service-section" name="section" value="${escapeHtml(section ?? "")}" maxlength="1024" placeholder="Use a section link from a service below"></p><p><label for="service-cover">Section and its descendants</label><input id="service-cover" name="cover" value="${escapeHtml(cover ?? "")}" maxlength="1024" placeholder="Owning services-section path"></p></details></form>`;
  const list = services.map(row => {
    const owner = row.seller?.enterprise ? ` Provider: ${escapeHtml(row.seller.enterprise)}.` : "";
    const sectionLink = row.section ? `<p><a href="/services?${escapeHtml(new URLSearchParams({ section: row.section }))}">More from ${escapeHtml(row.section.split("/").at(-1).replace(/-services-section$/u, "").replace(/-/gu, " "))}</a></p>` : "";
    const shopDetail = `/services/offer?${new URLSearchParams({ sku: row.sku })}`;
    return `<li><article><h2><a href="${escapeHtml(shopDetail)}">${escapeHtml(row.name)}</a></h2><p>${escapeHtml(row.description)}</p><p><strong>Catalog price:</strong> ${escapeHtml(row.pricePreview ?? "See current terms")} · ${escapeHtml(row.method)} · ${escapeHtml(row.category)}.${owner}</p>${sectionLink}<p><a href="${escapeHtml(shopDetail)}">Inspect input, output and buying options in the Shop</a> · <a href="${escapeHtml(row.inspectUrl)}">Original Bazaar listing</a></p></article></li>`;
  }).join("");
  const pageHref = target => `/services?${escapeHtml(parameters(target))}`;
  const lastStart = total > 0 ? Math.floor((total - 1) / limit) * limit : 0;
  const previousOffset = offset > 0 && total > 0
    ? Math.min(Math.max(0, offset - limit), lastStart) : null;
  const links = [
    previousOffset === null ? "" : `<a rel="prev" href="${pageHref(previousOffset)}">Previous services</a>`,
    nextOffset === null ? "" : `<a rel="next" href="${pageHref(nextOffset)}">More services</a>`,
  ].filter(Boolean).join(" · ");
  const feedback = services.length ? "" : `<p role="status">${total === 0
    ? "No matching services."
    : "No services at this page offset. Choose Previous services to return to a matching page."}</p>`;
  const nav = `${feedback}${links ? `<nav aria-label="Service results pages"><p>${links}</p></nav>` : ""}`;
  const range = services.length ? `${offset + 1}–${offset + services.length} of ${total}` : String(total);
  const machineUrl = `/services.json?${escapeHtml(parameters(offset))}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>561 Group Services · Shop</title><meta name="description" content="Find 561 Group data, analysis and software services by task or service section."><style>body{font:1rem/1.55 system-ui,sans-serif;color:#222;max-width:76rem;margin:auto;padding:1rem 2rem}header,footer{border-block:1px solid #aaa;padding:.8rem 0}a{color:#174b90}li{margin:0 0 1.25rem}ul{padding-left:1.25rem}article{max-width:62rem}h2{font-size:1.25rem}input{min-width:min(60vw,24rem);padding:.4rem}button{padding:.45rem}details{margin-top:1rem}details label{display:block}details input{width:min(90%,55rem)}small{color:#555}</style></head><body><header><a href="/">561 Group Shop</a> · <a href="https://bazaar.561.group">Bazaar</a> · <a href="https://market.561.group">Market</a></header><main><h1>Services for people and agents</h1><p>Find the data, analysis or software service you need. Browse by task or owning service section, then open a service for its input fields, current terms and delivery options.</p>${form}<p>${range} matching services.</p><ul>${list}</ul>${nav}<p><a href="${machineUrl}">Machine-readable service catalog</a> · <a href="https://market.561.group/v1/catalog">Operation catalog</a></p></main><footer><small>561 Group Shop · Service discovery through Bazaar · Purchases and delivery through Market.</small></footer></body></html>`;
}

// Enforce the byte cap WHILE consuming a streamed upstream body. Calling
// response.text() before checking size would still buffer an unbounded payload.

async function loadOriginalMarketPage(selection, fetchSource) {
  const response = await fetchSource(marketServicePageUrl(selection), {
    method: "GET", redirect: "manual", credentials: "omit",
    signal: AbortSignal.timeout(10000), headers: { accept: "application/json" }
  });
  if (response.status === 400) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200 ||
      !response.headers.get("content-type")?.includes("application/json") ||
      Number(response.headers.get("content-length") ?? 0) > MAX_UPSTREAM_BYTES)
    throw new TypeError("Original seller read is unavailable");
  return projectOriginalMarketServices(await readBoundedOriginalMarketJson(response), selection);
}

export function renderServiceOfferPage(reading) {
  const {offer, source, qualifications} = reading;
  const h = escapeHtml;
  const name = h(offer.name), sku = h(offer.sku);
  const schema = offer.input?.bodySchema;
  const output = offer.output?.schema;
  const properties = schema && typeof schema === "object" && !Array.isArray(schema) &&
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? Object.entries(schema.properties).slice(0, 24) : [];
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  const fields = properties.map(([key, value]) => {
    const node = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const type = typeof node.type === "string" ? node.type :
      Array.isArray(node.type) ? node.type.filter(t => typeof t === "string").join(" | ") : "Not declared";
    const description = typeof node.description === "string" ? node.description.slice(0, 400) : "";
    return `<tr><th scope="row">${h(key)}</th><td>${h(type)}</td><td>${required.has(key) ? "Required" : "Optional"}</td><td>${h(description)}</td></tr>`;
  }).join("");
  const contract = value => {
    if (!value || typeof value !== "object") return "<p>No structured contract supplied in this catalog record.</p>";
    const json = JSON.stringify(value, null, 2);
    return json.length > 16384
      ? "<p>The contract is too large for the inline preview. Inspect the exact machine-readable offer instead.</p>"
      : `<pre tabindex="0">${h(json)}</pre>`;
  };
  const endpoint = offer.method === "GET"
    ? `<a href="${h(offer.endpoint)}" rel="nofollow">Visit original seller endpoint (may require x402 payment)</a>`
    : `<code>${h(offer.method)} ${h(offer.endpoint)}</code>`;
  const provider = offer.seller?.enterprise ?? "Not identified in the catalog";
  const machine = `/services/offer.json?${new URLSearchParams({sku:offer.sku})}`;
  const sourceStatus = `${qualifications.listing}. ${qualifications.checkout}.`;
  const sectionLink = offer.section === undefined ? "" :
    `<p>Service section: <a href="/services?${h(new URLSearchParams({section:offer.section}))}">${h(offer.section)}</a></p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} · 561 Group Shop</title><meta name="description" content="Inspect the original service input, output, price preview and x402 purchase boundary."><style>
    body{font:1rem/1.55 system-ui,sans-serif;color:#222;max-width:68rem;margin:auto;padding:1rem 2rem}
    a{color:#174b90}header,footer{border-block:1px solid #aaa;padding:.85rem 0}
    section{padding:0 0 1.25rem}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #999;padding:.45rem;text-align:left;vertical-align:top}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:30rem;overflow:auto;background:#f3f3f3;padding:1rem}
    code{overflow-wrap:anywhere}small{color:#444}details{margin-block:.5rem 1rem}
  </style></head><body><header><nav aria-label="Shop navigation"><a href="/">561 Group Shop</a> · <a href="/services">All services</a> · <a href="https://bazaar.561.group">Bazaar</a></nav></header>
  <main><h1>${name}</h1><p>${h(offer.description)}</p><p><strong>Original offer:</strong> <code>${sku}</code></p>${sectionLink}
  <section aria-labelledby="provider"><h2 id="provider">Service provider and price</h2><p>Provider: ${h(provider)}. Original seller: ${h(source.market)}.</p>
  <p><strong>Catalog price preview:</strong> ${h(offer.pricePreview ?? "Unavailable")}. This is not a current payable quote.</p>
  <p><strong>Source rights verification:</strong> ${h(offer.sourceRightsVerification)}.</p>
  <p><strong>Checkout:</strong> Not available through this Shop detail page. Request the resource from its original seller to receive any current HTTP 402 payment requirements; payment authorization and delivery remain with the actual x402 client and seller.</p>
  <p>${endpoint} · <a href="${h(offer.inspectUrl)}">Inspect original Bazaar listing</a></p></section>
  <section aria-labelledby="input"><h2 id="input">What this service accepts</h2><p>Method: <strong>${h(offer.method)}</strong>. The request's admitted fields are described by the source contract, not an invented checkout form.</p>
  ${properties.length ? `<div role="region" aria-label="Source-declared input fields" tabindex="0"><table><caption>Input fields (first ${properties.length})</caption><thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Required</th><th scope="col">Description</th></tr></thead><tbody>${fields}</tbody></table></div>` : "<p>The seller did not declare individually displayable input fields.</p>"}
  <details><summary>Structured request body schema</summary>${contract(schema)}</details></section>
  <section aria-labelledby="output"><h2 id="output">What the service returns</h2><details><summary>Structured output schema</summary>${contract(output)}</details></section>
  <section aria-labelledby="compare"><h2 id="compare">Compare this offer with another</h2>
  <form action="/services/compare" method="GET">
    <input type="hidden" name="sku" value="${sku}">
    <label for="compare-sku">Another original seller SKU</label>
    <input id="compare-sku" name="sku" required maxlength="61" placeholder="ni:///sha-256;...">
    <button type="submit">Compare original offers</button>
  </form><p><small>Comparison is free, read-only, and does not invoke a paid resource.</small></p></section>
  <section aria-labelledby="agent"><h2 id="agent">For agents and technical buyers</h2>
  <p>Use the <a href="${h(machine)}">single-offer JSON readout</a> to inspect the exact source-reported method, URL, input and output contracts. Source records do not substitute for an actual 402 challenge, a signed payment authorization or a witnessed delivery.</p>
  <p><small>${h(sourceStatus)}</small></p></section></main>
  <footer><small>561 Group Shop · An original Market offer is displayed, not resold or settled here.</small></footer></body></html>`;
}

export async function serviceOfferResponse(request, {fetchSource = fetch} = {}) {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, {status:405,headers:{allow:"GET, HEAD"}});
  if (url.pathname !== "/services/offer" && url.pathname !== "/services/offer.json")
    return reject(404, "Unknown service detail path");
  const entries = [...url.searchParams.keys()];
  const sku = url.searchParams.get("sku");
  if (entries.length !== 1 || entries[0] !== "sku" || url.searchParams.getAll("sku").length !== 1 ||
      !/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/.test(sku ?? ""))
    return reject(400, "Select one exact original service identity");
  let page;
  try {
    page = await loadOriginalMarketPage(selector({query:sku,offset:0,limit:MAX_PAGE}),fetchSource);
  } catch {
    return reject(503, "Source-qualified service details temporarily unavailable");
  }
  if (page === null) return reject(400, "Invalid original service selection");
  if (page.total > MAX_PAGE) return reject(503, "Original seller search coverage is too broad to identify this offer");
  const found = page.services.filter(row => row.sku === sku);
  if (found.length === 0) return reject(404, "Original listed service not found");
  if (found.length !== 1) return reject(503, "Original seller returned an ambiguous service identity");
  const reading = Object.freeze({
    recordType:"561-group.shop.original-service-detail.v1",
    source:page.source, qualifications:page.qualifications,
    offer:found[0], sourceSearchCount:page.total,
  });
  const json = url.pathname.endsWith(".json");
  const payload = json ? JSON.stringify(reading) : renderServiceOfferPage(reading);
  return new Response(request.method === "HEAD" ? null : payload, {
    status:200,
    headers:{
      "content-type":json?"application/json; charset=utf-8":"text/html; charset=utf-8",
      "cache-control":"public, max-age=60",
      "x-content-type-options":"nosniff",
      "access-control-allow-origin":json?"*":"https://shop.561.group",
      ...(json?{}:{"content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}),
    }
  });
}

function reject(status, message) {
  return Response.json({ error: message, source: MARKET_CATALOG_URL }, {
    status, headers: { "cache-control": "no-store", "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff" }
  });
}

/** Source read is independently injectable for a real original Worker request test. */
export async function serviceBrowseResponse(request, { fetchSource = fetch } = {}) {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  let selection;
  try {
    const allowed = new Set(["q", "section", "cover", "offset", "limit"]);
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1)
        throw new TypeError("Unknown or repeated service search argument");
    }
    const number = (key, fallback) => {
      const value = url.searchParams.get(key);
      if (value === null) return fallback;
      if (!/^(0|[1-9][0-9]*)$/u.test(value)) throw new TypeError("Invalid service page number");
      return Number(value);
    };
    selection = selector({
      query: url.searchParams.get("q") ?? "",
      section: url.searchParams.get("section") || undefined,
      cover: url.searchParams.get("cover") || undefined,
      offset: number("offset", 0), limit: number("limit", 20),
    });
  } catch {
    return reject(400, "Invalid service search arguments");
  }
  let projection;
  try {
    projection = await loadOriginalMarketPage(selection, fetchSource);
    if (projection === null) return reject(400, "Invalid service section or search arguments");
  } catch {
    return reject(503, "Source-qualified service catalog temporarily unavailable");
  }
  const json = url.pathname === "/services.json";
  const body = json ? JSON.stringify(projection) : renderServiceBrowse(projection);
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: { "content-type": json ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": json ? "*" : "https://shop.561.group",
      "x-content-type-options": "nosniff",
      ...(json ? {} : { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" }),
    }
  });
}



/**
 * One source-owned dispatch for Shop service discovery. Unknown routes return
 * null to the original digital-goods Worker. No source read, wallet action or
 * local customer state is created by dispatch itself.
 */
export function routeServiceDiscovery(request, {fetchSource = fetch} = {}) {
  const path = new URL(request.url).pathname;
  if (path === '/services/compare' || path === '/services/compare.json')
    return serviceCompareResponse(request, {fetchSource});
  if (path === '/services/offer' || path === '/services/offer.json')
    return serviceOfferResponse(request, {fetchSource});
  if (path === '/services' || path === '/services.json')
    return serviceBrowseResponse(request, {fetchSource});
  return null;
}
