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
const MAX_UPSTREAM_BYTES = 4_000_000;
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
    return `<li><article><h2><a href="${escapeHtml(row.inspectUrl)}">${escapeHtml(row.name)}</a></h2><p>${escapeHtml(row.description)}</p><p><strong>Price:</strong> ${escapeHtml(row.pricePreview ?? "See service terms")} · ${escapeHtml(row.method)} · ${escapeHtml(row.category)}.${owner}</p>${sectionLink}<p><a href="${escapeHtml(row.inspectUrl)}">View service details</a></p></article></li>`;
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
async function readBoundedSource(response) {
  if (!response.body) throw new TypeError("Original seller returned an empty body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPSTREAM_BYTES) throw new TypeError("Seller read exceeds expected size");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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
    const response = await fetchSource(marketServicePageUrl(selection), {
      method: "GET", redirect: "manual", credentials: "omit",
      signal: AbortSignal.timeout(10000), headers: { accept: "application/json" }
    });
    if (response.status === 400) {
      await response.body?.cancel();
      return reject(400, "Invalid service section or search arguments");
    }
    if (response.status !== 200 ||
        !response.headers.get("content-type")?.includes("application/json") ||
        Number(response.headers.get("content-length") ?? 0) > MAX_UPSTREAM_BYTES)
      throw new TypeError("Original seller read is unavailable");
    projection = projectOriginalMarketServices(await readBoundedSource(response), selection);
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

