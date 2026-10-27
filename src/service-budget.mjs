/**
 * Source-only Shop budget view over the ORIGINAL Market basket preview.
 * All amounts are exact source-owned atomic-unit strings, not converted
 * USD, current HTTP 402 challenges, charges or wallet authorizations.
 */
import {MAX_ORIGINAL_MARKET_BYTES,readBoundedOriginalMarketJson} from "./original-market-reader.mjs";
export const ORIGINAL_MARKET_BASKET_URL = "https://market.561.group/v1/market/basket";
const NI=/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const ATOMIC=/^(0|[1-9][0-9]{0,77})$/u;
const record=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const escapeHtml=x=>String(x).replace(/[&<>"']/gu,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

function selectBudget(query) {
  const params=[...query.keys()];
  if (params.some(key=>!["sku","calls","maxTotalAtomic"].includes(key)))
    throw new TypeError("Unknown basket budget argument");
  const skus=query.getAll("sku"),countStrings=query.getAll("calls"),maxima=query.getAll("maxTotalAtomic");
  if (skus.length>8 || countStrings.length>8 || maxima.length>1 ||
      skus.some(sku=>!NI.test(sku)) || new Set(skus).size!==skus.length ||
      countStrings.some(value=>!/^[1-9][0-9]*$/u.test(value) ||
        Number(value)>100 || !Number.isSafeInteger(Number(value))))
    throw new TypeError("Basket requires bounded source SKUs and positive calls");
  if (countStrings.length && countStrings.length!==skus.length)
    throw new TypeError("Every selected source SKU needs its exact call count");
  const counts=countStrings.map(Number);
  if (counts.reduce((a,b)=>a+b,0)>100)
    throw new TypeError("Basket exceeds seller host call-count ceiling");
  if (maxima.length && !ATOMIC.test(maxima[0]))
    throw new TypeError("Basket ceiling must be canonical EVM atomic units");
  return {skus,counts,maximum: maxima[0]??null,
    complete:skus.length>0 && counts.length===skus.length && maxima.length===1};
}

export function admitOriginalMarketBasket(raw,requested) {
  if (!record(raw) || !Array.isArray(raw.lines) ||
      raw.lines.length!==requested.skus.length ||
      raw.paymentAuthorized!==false || raw.purchaseExecuted!==false ||
      raw.deliveryReceived!==false ||
      (raw.maximumTotalAtomic!==undefined && raw.maximumTotalAtomic!==requested.maximum) ||
      typeof raw.complete!=="boolean" ||
      (raw.withinAdvertisedCeiling!==null && typeof raw.withinAdvertisedCeiling!=="boolean") ||
      (raw.pricedSubtotalAtomic!==null && !ATOMIC.test(raw.pricedSubtotalAtomic)) ||
      (raw.advertisedTotalAtomic!==null && !ATOMIC.test(raw.advertisedTotalAtomic)))
    throw new TypeError("Original seller supplied no admitted read-only basket");
  const lines=raw.lines.map((line,i)=>{
    if (!record(line) || line.sku!==requested.skus[i] ||
        (line.calls!==undefined && line.calls!==requested.counts[i]) ||
        typeof line.state!=="string" ||
        (line.extendedAmountAtomic!==null && line.extendedAmountAtomic!==undefined &&
          !ATOMIC.test(line.extendedAmountAtomic)))
      throw new TypeError("Original basket line disagrees with requested SKU/call identity");
    return Object.freeze({
      sku:requested.skus[i],calls:requested.counts[i],
      state:line.state,extendedAmountAtomic:line.extendedAmountAtomic??null,
      sourceCell:typeof line.cell==="string"?line.cell:null,
      sourceLaw:typeof line.law==="string"?line.law:null,
      originalDetail:"/services/offer?"+new URLSearchParams({sku:requested.skus[i]})
    });
  });
  return Object.freeze({
    recordType:"561-group.shop.original-market-budget.v1",
    origin:ORIGINAL_MARKET_BASKET_URL,
    maximumTotalAtomic:requested.maximum,
    complete:raw.complete,
    state:typeof raw.state==="string"?raw.state:"unknown",
    pricedSubtotalAtomic:raw.pricedSubtotalAtomic,
    advertisedTotalAtomic:raw.advertisedTotalAtomic,
    withinAdvertisedCeiling:raw.withinAdvertisedCeiling,
    settlement:Object.freeze({
      network:typeof raw.settlement?.network==="string"?raw.settlement.network:null,
      asset:typeof raw.settlement?.asset==="string"?raw.settlement.asset:null,
    }),
    lines:Object.freeze(lines),
    paymentAuthorized:false,purchaseExecuted:false,deliveryReceived:false,
    interpretation:"Seller-advertised atomic-unit preview only. A valid HTTP 402 challenge, present quote, authorization, signed payment, settlement and delivered result remain separate.",
  });
}

function formOf(selection) {
  const h=escapeHtml;
  const originals=selection.skus.length?selection.skus:[""];
  const fields=originals.map((sku,i)=>{
    const known=selection.counts[i]??1;
    return '<fieldset><legend>API call '+(i+1)+'</legend>'+
      '<label>Original offer SKU <input name="sku" required maxlength="61" value="'+h(sku)+'"></label>'+
      '<label> Calls <input name="calls" type="number" min="1" max="100" required value="'+known+'"></label>'+
      '</fieldset>';
  }).join("");
  return '<form action="/services/basket" method="GET">'+fields+
    '<label for="atomic-ceiling">Maximum original seller asset units (unsigned atomic integer)</label>'+
    '<input id="atomic-ceiling" name="maxTotalAtomic" required inputmode="numeric" pattern="(0|[1-9][0-9]*)" maxlength="78" value="'+
    h(selection.maximum??"")+'">'+
    '<button type="submit">Preview original fixed-price call budget</button></form>';
}
function basePage(content) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Original API call budget · 561 Group Shop</title>'+
    '<style>body{font:1rem/1.55 system-ui,sans-serif;margin:auto;max-width:68rem;padding:1rem 1.5rem;color:#222}'+
    'a{color:#174b90}fieldset{margin:.75rem 0}label{display:block;margin:.5rem 0}'+
    'input{padding:.4rem;max-width:100%}th,td{border:1px solid #aaa;padding:.5rem;text-align:left;vertical-align:top}'+
    'table{border-collapse:collapse;width:100%}</style></head><body>'+
    '<header><nav><a href="/">561 Group Shop</a> · <a href="/services">Browse services</a> · '+
    '<a href="https://market.561.group">Original Market</a></nav></header>'+
    '<main><h1>Plan API calls without a wallet</h1>'+
    '<p>Source advertised EVM asset base units, not USD, a price quote, or permission to spend.</p>'+
    content+'</main></body></html>';
}
export function renderOriginalMarketBudgetPage(budget,selection) {
  const h=escapeHtml;
  const rows=budget.lines.map(line=>'<tr><th scope="row"><a href="'+h(line.originalDetail)+'">'+
    h(line.sku)+'</a></th><td>'+line.calls+'</td><td>'+h(line.state)+'</td>'+
    '<td>'+h(line.extendedAmountAtomic??"Unknown or variable")+'</td></tr>').join("");
  const findings='<p><strong>Seller advertised state:</strong> '+h(budget.state)+
    '. <strong>Completeness:</strong> '+(budget.complete?"Complete fixed-price preview":"Incomplete; at least one item cannot be priced")+
    '. <strong>Under selected ceiling:</strong> '+(budget.withinAdvertisedCeiling===null?"Unknown: incomplete source pricing":budget.withinAdvertisedCeiling?"Yes, by original source preview":"No, by original source preview")+
    '.</p><p><strong>Priced subtotal (atomic):</strong> '+h(budget.pricedSubtotalAtomic??"Unknown")+
    '. <strong>Advertised total (atomic):</strong> '+h(budget.advertisedTotalAtomic??"Unknown")+
    '. <strong>Selected maximum (atomic):</strong> '+h(budget.maximumTotalAtomic)+
    '.</p><p><strong>Seller chain:</strong> '+h(budget.settlement.network??"Not stated")+
    '; <strong>Asset:</strong> '+h(budget.settlement.asset??"Not stated")+'.</p>';
  return basePage('<p>'+h(budget.interpretation)+'</p>'+findings+
    '<table><caption>Original Market budget lines</caption><thead><tr>'+
    '<th scope="col">Original SKU</th><th scope="col">Calls</th>'+
    '<th scope="col">Source price status</th><th scope="col">Extended atomic-unit preview</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table>'+
    '<p><a href="/services/basket.json?'+h((()=>{
      const p=new URLSearchParams();
      selection.skus.forEach((sku,i)=>{p.append("sku",sku);p.append("calls",String(selection.counts[i]));});
      p.set("maxTotalAtomic",selection.maximum);
      return p;
    })())+'">Machine-readable original budget</a></p>'+
    '<h2>Change the budget</h2>'+formOf(selection));
}

export async function serviceBudgetResponse(request,{fetchSource=fetch}={}) {
  const url=new URL(request.url),json=url.pathname==="/services/basket.json";
  if (!["GET","HEAD"].includes(request.method))
    return new Response(null,{status:405,headers:{allow:"GET, HEAD"}});
  if (!json && url.pathname!=="/services/basket")
    return Response.json({error:"Unknown budget route"},{status:404});
  let selection;
  try {selection=selectBudget(url.searchParams);}
  catch {return Response.json({error:"Invalid exact call-budget selection"},{status:400,
    headers:{"cache-control":"no-store"}});}
  if (!selection.complete) {
    if (json) return Response.json({error:"An exact SKU, call count and maximum are required"},
      {status:400,headers:{"cache-control":"no-store"}});
    return new Response(request.method==="HEAD"?null:basePage(formOf(selection)),{
      status:200,headers:{"content-type":"text/html; charset=utf-8",
        "cache-control":"no-store","content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"}});
  }
  const original=new URL(ORIGINAL_MARKET_BASKET_URL);
  selection.skus.forEach((sku,i)=>{
    original.searchParams.append("sku",sku);
    original.searchParams.append("calls",String(selection.counts[i]));
  });
  original.searchParams.set("maxTotalAtomic",selection.maximum);
  let budget;
  try {
    const response=await fetchSource(original.href,{
      method:"GET",redirect:"manual",credentials:"omit",
      signal:AbortSignal.timeout(10000),headers:{accept:"application/json"}
    });
    if (response.status!==200 ||
        !response.headers.get("content-type")?.includes("application/json") ||
        Number(response.headers.get("content-length")??0)>MAX_ORIGINAL_MARKET_BYTES)
      throw new TypeError("Original seller budget is unavailable");
    budget=admitOriginalMarketBasket(await readBoundedOriginalMarketJson(response),selection);
  } catch {
    return Response.json({error:"Source-qualified seller budget temporarily unavailable"},
      {status:503,headers:{"cache-control":"no-store"}});
  }
  return new Response(request.method==="HEAD"?null:(json?JSON.stringify(budget):renderOriginalMarketBudgetPage(budget,selection)),
    {status:200,headers:{"content-type":json?"application/json; charset=utf-8":"text/html; charset=utf-8",
      "cache-control":"no-store","x-content-type-options":"nosniff",
      "access-control-allow-origin":json?"*":"https://shop.561.group",
      ...(json?{}:{"content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"})}});
}
