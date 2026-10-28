import {serviceOfferResponse} from "./service-discovery.mjs";

// Same-seller transport only: Shop NEVER quotes, signs, settles, recovers, or
// books an x402 payment. The canonical Market receives the original request.
// The response's resource identity remains Market's, not Shop's.
const SHOP = "https://shop.561.group";
const SELLER = "https://market.561.group";
const MAX_BODY = 65536;
const MAX_PAYMENT_HEADER = 16384;
const SKU = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;

function refusal(status, message, extra = {}) {
  return Response.json({error:message}, {status, headers:{
    "cache-control":"no-store", "x-content-type-options":"nosniff", ...extra,
  }});
}

async function boundedBody(request) {
  if (!request.body) return undefined;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) ||
      !Number.isSafeInteger(Number(declared)) || Number(declared) > MAX_BODY))
    throw new RangeError("Request body exceeds relay limit");
  const reader = request.body.getReader();
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) throw new RangeError("Request body exceeds relay limit");
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return bytes;
}

function paidHeaders(request) {
  const outgoing = new Headers();
  const signature = request.headers.get("payment-signature");
  const legacy = request.headers.get("x-payment");
  if (signature && legacy) throw new TypeError("Ambiguous payment authorization");
  for(const name of ["payment-signature","x-payment","x-payment-recovery"]){
    const value = request.headers.get(name);
    if (value !== null) {
      if (!value || value.length > MAX_PAYMENT_HEADER ||
          /[\u0000-\u001f\u007f]/u.test(value))
        throw new TypeError("Malformed original-seller payment header");
      outgoing.set(name,value);
    }
  }
  const accept=request.headers.get("accept");
  if(accept && accept.length <= 256) outgoing.set("accept",accept);
  const type=request.headers.get("content-type");
  if(request.method==="POST"){
    if(!type || !/^application\/json(?:\s*;|$)/iu.test(type))
      throw new TypeError("The bounded Shop relay accepts JSON POST inputs only");
    outgoing.set("content-type",type);
  }
  return outgoing;
}

/** Relay only an exact listed original seller offer. No auth tokens, cookies,
 * arbitrary target URLs, Shop invoices, independent payee or automatic retries.
 * A signed payment may have settled even if network delivery subsequently
 * fails; the caller must use the ORIGINAL seller's recovery process.
 */
export async function serviceMarketX402RelayResponse(request,{fetchSource=fetch}={}){
  const url=new URL(request.url);
  if(url.pathname!=="/services/execute") return null;
  if(url.origin!==SHOP) return refusal(400,"Use the canonical Shop origin");
  if(!["GET","POST"].includes(request.method))
    return refusal(405,"Only GET and POST original offer methods are supported",{"allow":"GET, POST"});
  const entries=[...url.searchParams.keys()];
  const sku=url.searchParams.get("sku");
  if(entries.length!==1 || entries[0]!=="sku" ||
      url.searchParams.getAll("sku").length!==1 || !SKU.test(sku??""))
    return refusal(400,"Supply exactly one canonical original seller SKU");

  let headers,body;
  try{
    headers=paidHeaders(request);
    if(request.method==="POST") body=await boundedBody(request);
  }catch(error){
    return refusal(error instanceof RangeError?413:400,"Invalid or oversized buyer input");
  }

  let offer;
  try{
    const lookup=await serviceOfferResponse(
      new Request(SHOP+"/services/offer.json?"+new URLSearchParams({sku})),
      {fetchSource},
    );
    if(lookup.status!==200)
      return refusal(lookup.status===404?404:503,"Original seller offer not currently qualified");
    offer=(await lookup.json()).offer;
  }catch{
    return refusal(503,"Original seller catalog unavailable");
  }
  let endpoint;
  try{
    endpoint=new URL(offer.endpoint);
    if(endpoint.origin!==SELLER || endpoint.username || endpoint.password ||
        endpoint.hash || !endpoint.pathname.startsWith("/v1/") ||
        !["GET","POST"].includes(offer.method))
      throw new TypeError("Unqualified original seller endpoint");
  }catch{
    return refusal(503,"Original seller endpoint not qualified");
  }
  if(request.method!==offer.method)
    return refusal(405,"Use the original seller method",{"allow":offer.method});

  const signed=headers.has("payment-signature") || headers.has("x-payment");
  let received;
  try{
    received=await fetchSource(endpoint.href,{
      method:offer.method,headers,body,credentials:"omit",redirect:"manual",
      ...(signed?{}:{signal:AbortSignal.timeout(15000)}),
    });
  }catch{
    return refusal(502,signed
      ?"Original seller response unavailable; payment status UNKNOWN. Do not replay a signed payment without its original recovery procedure."
      :"Original seller response unavailable; no purchase received by Shop");
  }
  if(received.status>=300 && received.status<400){
    await received.body?.cancel().catch(()=>{});
    return refusal(502,"Original seller redirect refused");
  }
  // Preserve the seller's x402 challenge and settlement receipt unmodified.
  // Headers which could disclose a buyer/session or affect resource routing are
  // never synthesized; cache/identity safeguards are always Shop-owned.
  const pass=new Headers({
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "referrer-policy":"no-referrer",
    "content-security-policy":"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
    "access-control-expose-headers":"payment-required, payment-response, x-payment-response",
  });
  // Paid results may contain active HTML or SVG. Prevent execution in Shop's
  // origin without discarding settled bytes or rewriting seller receipts.
  if(received.status>=200 && received.status<300)
    pass.set("content-disposition","attachment");
  for(const name of ["content-type","payment-required","payment-response","x-payment-response"]){
    const value=received.headers.get(name);
    if(value!==null) pass.set(name,value);
  }
  return new Response(received.body,{status:received.status,headers:pass});
}
