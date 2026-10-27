/**
 * Shop reader of the ORIGINAL Market exact-SKU comparison service.
 * Original Market owns seller identity, price declaration, input/output
 * contract, provenance, source-example admission and all payment authority.
 * Shop is a bounded, nonoperative HTML/JSON presentation consumer only.
 */
import {MAX_ORIGINAL_MARKET_BYTES, readBoundedOriginalMarketJson} from "./original-market-reader.mjs";

export const ORIGINAL_MARKET_COMPARISON_URL = "https://market.561.group/v1/market/compare";
const EXACT_SKU = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const escapeHtml = value => String(value).replace(/[&<>"']/gu, ch =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const urlForOffer = sku => "/services/offer?" + new URLSearchParams({sku}).toString();

export function admitServiceComparison(source, requestedSkus) {
  if (!record(source) || source.kind !== "x402.market.offer-comparison.v1" ||
      !Array.isArray(requestedSkus) || requestedSkus.length < 2 || requestedSkus.length > 8 ||
      !Array.isArray(source.requestedSkus) ||
      source.requestedSkus.length !== requestedSkus.length ||
      source.requestedSkus.some((id, i) => id !== requestedSkus[i]) ||
      !Array.isArray(source.offers) || !Array.isArray(source.missingSkus))
    throw new TypeError("Market comparison must match the exact requested SKU window");
  const expected = new Set(requestedSkus), included = new Map();
  for (const row of source.offers) {
    if (!record(row) || !expected.has(row.sku) || included.has(row.sku) ||
        typeof row.name !== "string" || !row.name.trim() ||
        typeof row.operation !== "string" || !row.operation ||
        typeof row.method !== "string" ||
        (row.pricePreview != null && typeof row.pricePreview !== "string"))
      throw new TypeError("Market comparison has foreign or malformed source identities");
    included.set(row.sku, Object.freeze({
      sku:row.sku, name:row.name, operation:row.operation, method:row.method,
      description:typeof row.description === "string" ? row.description : "",
      category:typeof row.category === "string" ? row.category : null,
      sellerEnterprise:typeof row.sellerEnterprise === "string" ? row.sellerEnterprise : null,
      producingPackage:typeof row.producerDeclaration?.package === "string"
        ? row.producerDeclaration.package : null,
      pricePreview:row.pricePreview ?? null,
      sourceRightsVerification:typeof row.sourceRightsVerification === "string"
        ? row.sourceRightsVerification : "not-declared",
      request:record(row.request) ? row.request : null,
      output:record(row.output) ? row.output : null,
      settled:row.settlementVerified === true,
      delivered:row.paidDeliveryVerified === true,
      originalDetail:urlForOffer(row.sku),
    }));
  }
  const missing=new Set();
  for (const sku of source.missingSkus) {
    if (!expected.has(sku) || included.has(sku) || missing.has(sku))
      throw new TypeError("Market comparison contradicts original public-listing coverage");
    missing.add(sku);
  }
  if (included.size + missing.size !== expected.size)
    throw new TypeError("Market comparison leaves requested identities unaccounted for");
  const originalSample=source.sampleComposition;
  let sample=null;
  if (originalSample != null) {
    if (!record(originalSample) ||
        originalSample.kind !== "x402.market.sample-composition-reading.v1" ||
        !Array.isArray(originalSample.sampleAdmittedLinks) ||
        originalSample.sampleAdmittedLinks.length > 56)
      throw new TypeError("Market source-example comparison is malformed");
    const links=originalSample.sampleAdmittedLinks.map(link => {
      if (!record(link) || !included.has(link.from) || !included.has(link.to) ||
          link.executionAuthorized !== false || link.contractualCompositionProven !== false)
        throw new TypeError("Market source-example edge cannot be represented as nonoperative");
      return Object.freeze({from:link.from,to:link.to,executionAuthorized:false,
        contractualCompositionProven:false});
    });
    sample=Object.freeze({
      kind:originalSample.kind,
      complete:originalSample.complete === true,
      links:Object.freeze(links),
      authorizesExecution:false,
    });
  }
  return Object.freeze({
    recordType:"561-group.shop.original-service-comparison.v1",
    source:Object.freeze({origin:"https://market.561.group",
      comparator:ORIGINAL_MARKET_COMPARISON_URL}),
    requestedSkus:Object.freeze([...requestedSkus]),
    offers:Object.freeze(requestedSkus.filter(sku=>included.has(sku)).map(sku=>included.get(sku))),
    missingSkus:Object.freeze(requestedSkus.filter(sku=>missing.has(sku))),
    sampleComposition:sample,
    interpretation:"Seller descriptions and preview prices are observations, not proof of operation equivalence, current HTTP 402 terms, payment, settlement, or delivery.",
  });
}

function compareParameters(skus) {
  return new URLSearchParams(skus.map(sku=>["sku",sku])).toString();
}
function renderPicker(skus) {
  const chosen=skus.map(sku=>'<input type="hidden" name="sku" value="'+escapeHtml(sku)+'">'+
    '<p>Selected: <code>'+escapeHtml(sku)+'</code></p>').join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Compare original API offers · 561 Group Shop</title></head><body><main>'+
    '<nav><a href="/services">Find services in the Shop</a></nav>'+
    '<h1>Compare original API offers</h1><p>Choose two to eight original SKUs; this is free and read-only.</p>'+
    '<form action="/services/compare" method="GET">'+chosen+
    '<label for="sku-more">Another original SKU</label>'+
    '<input id="sku-more" name="sku" required maxlength="61" placeholder="ni:///sha-256;...">'+
    '<button type="submit">Compare original service contracts</button></form>'+
    '<p>No requests to priced resources or payment authorizations are made.</p>'+
    '</main></body></html>';
}
const declaredContract = obj => {
  if (obj === null) return "Not supplied";
  const text=JSON.stringify(obj,null,2);
  return text.length <= 8192 ? text : "Source contract exceeds the bounded inline preview; inspect the original detail.";
};
/** Responsive no-script and keyboard-accessible side-by-side original views. */
export function renderServiceComparisonHTML(reading) {
  const offers=reading.offers,h=escapeHtml;
  const row=(label,read) => '<tr><th scope="row">'+h(label)+'</th>'+
    offers.map(offer=>'<td>'+h(read(offer))+'</td>').join("")+'</tr>';
  const headings=offers.map(offer=>'<th scope="col"><a href="'+h(offer.originalDetail)+'">'+
    h(offer.name)+'</a><small><code>'+h(offer.sku)+'</code></small></th>').join("");
  const compareTable=offers.length ? '<div role="region" tabindex="0" '+
    'aria-label="Source service comparison, scroll horizontally if needed" style="overflow-x:auto">'+
    '<table><caption>Source-declared information for '+offers.length+' publicly listed offers</caption>'+
    '<thead><tr><th scope="col">Source property</th>'+headings+'</tr></thead><tbody>'+
    row("Service description",offer=>offer.description)+
    row("Declared operation",offer=>offer.operation)+
    row("HTTP method",offer=>offer.method)+
    row("Service category",offer=>offer.category??"Not declared")+
    row("Original seller",offer=>offer.sellerEnterprise??"Not declared")+
    row("Producer package",offer=>offer.producingPackage??"Not declared")+
    row("Catalog price preview",offer=>offer.pricePreview??"Not declared")+
    row("Source rights verification",offer=>offer.sourceRightsVerification)+
    row("Request input",offer=>declaredContract(offer.request))+
    row("Output contract",offer=>declaredContract(offer.output))+
    '</tbody></table></div>' :
    '<p>No requested offers were publicly listed in the original seller reading.</p>';
  const omissions=reading.missingSkus.length ?
    '<section><h2>Unlisted or missing original SKUs</h2><ul>'+
    reading.missingSkus.map(sku=>'<li><code>'+h(sku)+'</code> — no public seller offer was returned</li>').join("")+
    '</ul></section>' : "";
  const sample=reading.sampleComposition;
  const links=sample?.links.length ?
    '<section><h2>Source-example shape readings</h2>'+
    '<p>One admitted example does not prove compatible operations, permit execution or produce delivery.</p><ul>'+
    sample.links.map(link=>'<li><code>'+h(link.from)+'</code> → <code>'+h(link.to)+
      '</code>: original example admitted; execution not authorized</li>').join("")+
    '</ul></section>' : "";
  const query=compareParameters(reading.requestedSkus);
  const budgetRows=offers.map((offer,i)=>'<fieldset><legend>Source API '+(i+1)+'</legend>'+
    '<input type="hidden" name="sku" value="'+h(offer.sku)+'">'+
    '<label>Calls <input name="calls" type="number" min="1" max="100" required value="1"></label>'+
    '<small>'+h(offer.name)+' — price preview '+h(offer.pricePreview??"Not supplied")+'</small></fieldset>').join("");
  const hidden=reading.requestedSkus.map(sku=>'<input type="hidden" name="sku" value="'+h(sku)+'">').join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Compare original API offers · 561 Group Shop</title>'+
    '<style>body{font:1rem/1.55 system-ui,sans-serif;max-width:90rem;margin:auto;padding:1rem 1.5rem;color:#222}'+
    'a{color:#174b90}table{width:100%;min-width:42rem;border-collapse:collapse}'+
    'th,td{border:1px solid #999;padding:.6rem;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}'+
    'thead th{min-width:15rem}small{display:block;font-size:.75rem}'+
    'header,footer{border-block:1px solid #aaa;padding:1rem 0}input{padding:.45rem;max-width:100%}</style>'+
    '</head><body><header><nav aria-label="Shop navigation"><a href="/">561 Group Shop</a> · '+
    '<a href="/services">Browse services</a> · <a href="https://market.561.group">Original Market</a></nav></header>'+
    '<main><h1>Compare API services</h1><p>'+h(reading.interpretation)+'</p>'+
    compareTable+omissions+links+
    '<p><a href="/services/compare.json?'+h(query)+'">Machine-readable original comparison</a></p>'+
    (offers.length?'<section><h2>Budget these original API calls</h2>'+
      '<p>Enter a ceiling in the original seller asset base units, not dollars. This is not a quote or a purchase.</p>'+
      '<form action="/services/basket" method="GET">'+budgetRows+
      '<label for="budget-ceiling">Maximum atomic units</label>'+
      '<input id="budget-ceiling" name="maxTotalAtomic" required maxlength="78" inputmode="numeric" pattern="(0|[1-9][0-9]*)">'+
      '<button type="submit">Preview an original basket without a wallet</button></form></section>':'')+

    '<form action="/services/compare" method="GET">'+hidden+
    '<label for="more-sku">Add another original SKU</label>'+
    '<input id="more-sku" name="sku" maxlength="61" required placeholder="ni:///sha-256;...">'+
    '<button type="submit"'+(reading.requestedSkus.length>=8?' disabled':'')+
    '>Extend comparison</button></form>'+
    '<p><small>At most eight original offers; no resources invoked, payments authorized, or workflows run.</small></p>'+
    '</main><footer><small>Shop renders original Market comparison evidence, not another seller ledger.</small></footer></body></html>';
}

/** Never promote a Market comparison response into a purchase or local price. */
export async function serviceCompareResponse(request,{fetchSource=fetch}={}) {
  const url=new URL(request.url);
  if (!["GET","HEAD"].includes(request.method))
    return new Response(null,{status:405,headers:{allow:"GET, HEAD"}});
  const json=url.pathname==="/services/compare.json";
  if (!json && url.pathname!=="/services/compare")
    return Response.json({error:"Unknown original comparison route"},{status:404,headers:{"cache-control":"no-store"}});
  const keys=[...url.searchParams.keys()],skus=url.searchParams.getAll("sku");
  if (keys.some(key=>key!=="sku") || skus.length>8 ||
      new Set(skus).size!==skus.length || skus.some(sku=>!EXACT_SKU.test(sku)))
    return Response.json({error:"Select at most eight distinct exact original SKUs"},{status:400,headers:{"cache-control":"no-store"}});
  if (skus.length<2) {
    if (json) return Response.json({error:"Comparison JSON requires two to eight source SKUs"},
      {status:400,headers:{"cache-control":"no-store"}});
    return new Response(request.method==="HEAD"?null:renderPicker(skus),{status:200,headers:{
      "content-type":"text/html; charset=utf-8","cache-control":"no-store",
      "content-security-policy":"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }});
  }
  const address=new URL(ORIGINAL_MARKET_COMPARISON_URL);
  for (const sku of skus) address.searchParams.append("sku",sku);
  let reading;
  try {
    const response=await fetchSource(address.href,{
      method:"GET",redirect:"manual",credentials:"omit",
      signal:AbortSignal.timeout(10000),headers:{accept:"application/json"}
    });
    if (response.status!==200 ||
        !response.headers.get("content-type")?.includes("application/json") ||
        Number(response.headers.get("content-length")??0)>MAX_ORIGINAL_MARKET_BYTES)
      throw new TypeError("Original seller comparison unavailable");
    reading=admitServiceComparison(await readBoundedOriginalMarketJson(response),skus);
  } catch {
    return Response.json({error:"Source-qualified seller comparison temporarily unavailable"},
      {status:503,headers:{"cache-control":"no-store"}});
  }
  const payload=json?JSON.stringify(reading):renderServiceComparisonHTML(reading);
  return new Response(request.method==="HEAD"?null:payload,{status:200,headers:{
    "content-type":json?"application/json; charset=utf-8":"text/html; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff",
    "access-control-allow-origin":json?"*":"https://shop.561.group",
    ...(json?{}:{"content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"})
  }});
}
