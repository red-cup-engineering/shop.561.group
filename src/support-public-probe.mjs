/** Read-only installed-public-route receiving for the original Shop support campaign.
 * GET never follows Stripe redirects, sends no cookies, never starts Checkout,
 * and does not establish a deployed revision, paid sale or cleared proceeds.
 */
const isObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const knownURL=value=>typeof value==="string"&&/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(value);
// Attribution must carry actual distinct Stripe Payment Link identities, not
// absent or duplicate opaque keys that can falsely match a share-pack echo.
const knownLinkId=value=>typeof value==="string"&&/^plink_[A-Za-z0-9_]+$/u.test(value);
const sameOrigin=(left,right)=>new URL(left).origin===new URL(right).origin;

// Bound HTTP receipt bytes before converting to text or JSON; inspecting length
// after response.text()/json() would already have buffered an untrusted body.
async function boundedBodyText(response,maxBytes){
 const size=response.headers.get("content-length");
 if(size!==null&&/^[0-9]+$/u.test(size)&&Number(size)>maxBytes)return null;
 if(!response.body)return "";
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let bytes=0,content="";
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes){void reader.cancel().catch(()=>{});return null;}
   content+=decoder.decode(value,{stream:true});
  }
  return content+decoder.decode();
 }finally{reader.releaseLock();}
}

// Diagnostic only: this same-origin source signature does NOT attest the exact
// deployed revision, Cloudflare Worker binding, or any completed purchase.
async function workerHandlerSignature(fetcher,origin,timeoutMs){
 const requestPath="/robots.txt";
 try{
  const response=await fetcher(origin+requestPath,{
   method:"GET",redirect:"manual",credentials:"omit",cache:"no-store",
   headers:{accept:"text/plain"},signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response||typeof response.status!=="number"||!response.headers)
   return {requestPath,httpStatus:null,outcome:"unobserved"};
  const text=response.status===200&&/text\/plain/iu.test(response.headers.get("content-type")??"")
   ?await boundedBodyText(response,4096):null;
  const matched=typeof text==="string"&&text.includes("User-agent: *")&&
   text.includes("Sitemap: "+origin+"/sitemap.xml");
  return {requestPath,httpStatus:response.status,outcome:matched?"matched":"mismatched"};
 }catch{
  return {requestPath,httpStatus:null,outcome:"unobserved"};
 }
}

function checkCampaign(campaign){
 if(!isObject(campaign)||campaign.canonicalUrl!=="https://shop.561.group/support"||
    typeof campaign.campaignId!=="string"||typeof campaign.title!=="string"||
    typeof campaign.merchantNotice!=="string"||campaign.merchantNotice.length<15||
    !isObject(campaign.oneTime)||!isObject(campaign.oneTime.links)||
    !isObject(campaign.monthly)||!knownURL(campaign.monthly.url)||!knownLinkId(campaign.monthly.id)||
    !Array.isArray(campaign.channels)||!campaign.channels.length)
  throw new TypeError("Source-qualified public Shop support campaign required");
 const links=Object.entries(campaign.oneTime.links);
 if(links.length<1||links.length>8||!links.some(([channel])=>channel==="direct")||
    links.some(([channel,link])=>!/^[a-z0-9-]+$/.test(channel)||!knownURL(link?.url)||!knownLinkId(link?.id)))
  throw new TypeError("Bounded source-owned support payment-link routes required");
 const ids=new Set(links.map(([,link])=>link.url));
 if(ids.size!==links.length||ids.has(campaign.monthly.url))
  throw new TypeError("Distinct original Stripe routes required");
 const linkIds=[...links.map(([,link])=>link.id),campaign.monthly.id];
 if(new Set(linkIds).size!==linkIds.length)
  throw new TypeError("Distinct original Stripe Payment Link identifiers required");
 if(campaign.channels.some(channel=>!isObject(channel)||
    !/^[a-z0-9-]{1,64}$/u.test(channel.id??"")||
    !/^[a-z0-9-]{1,64}$/u.test(channel.medium??""))||
    new Set(campaign.channels.map(channel=>channel.id)).size!==campaign.channels.length)
  throw new TypeError("Unique bounded original campaign channels required");
 return links;
}

function expectedShareRows(campaign){
 return campaign.channels.map(channel=>{
  const source=campaign.oneTime.links[channel.id]??campaign.oneTime.links.direct;
  const url=new URL(campaign.canonicalUrl);
  url.searchParams.set("utm_source",channel.id);
  url.searchParams.set("utm_medium",channel.medium);
  url.searchParams.set("utm_campaign",campaign.campaignId);
  return {channel:channel.id,medium:channel.medium,shareUrl:url.toString(),paymentLinkId:source.id};
 });
}

/** Public, non-mutating probe. `fetcher` injection is for deterministic source-only tests. */
export async function probePublicSupport({campaign,fetcher=globalThis.fetch,timeoutMs=7000,now=()=>new Date().toISOString()}={}){
 const links=checkCampaign(campaign);
 if(typeof fetcher!=="function"||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
  throw new TypeError("Bounded read-only fetch implementation required");
 const origin=new URL(campaign.canonicalUrl).origin;
 const cases=[
  {name:"landing",path:"/support?utm_source=github",kind:"landing"},
  {name:"share-pack",path:"/support/share.json",kind:"share"},
  ...links.map(([channel,link])=>({
   name:`checkout-redirect:${channel}`,path:`/support/go?kind=one-time&source=${encodeURIComponent(channel)}`,
   kind:"redirect",destination:link.url
  })),
  {name:"checkout-redirect:monthly",path:"/support/go?kind=monthly&source=direct",kind:"redirect",destination:campaign.monthly.url}
 ];
 const checks=await Promise.all(cases.map(async ({name,path,kind,destination})=>{
  const url=new URL(path,origin);
  if(!sameOrigin(url.href,campaign.canonicalUrl))throw new TypeError("Probe may not leave the original Shop origin");
  try{
   const response=await fetcher(url.href,{
    method:"GET",redirect:"manual",credentials:"omit",cache:"no-store",
    headers:{accept:kind==="share"?"application/json":"text/html,*/*;q=0.5"},
    signal:AbortSignal.timeout(timeoutMs)
   });
   if(!response||typeof response.status!=="number"||!response.headers)
    return {name,requestPath:url.pathname,outcome:"unobserved",httpStatus:null};
   let matches=false;
   if(kind==="redirect"){
    matches=response.status===303&&response.headers.get("location")===destination&&
      response.headers.get("referrer-policy")==="no-referrer";
   }else if(kind==="landing"&&response.status===200&&
     /text\/html/i.test(response.headers.get("content-type")??"")){
    const html=await boundedBodyText(response,250000);
    matches=html!==null&&html.includes(campaign.title)&&
     html.includes(campaign.merchantNotice)&&html.includes("/support/go?kind=one-time");
   }else if(kind==="share"&&response.status===200&&
     /application\/json/i.test(response.headers.get("content-type")??"")){
    const raw=await boundedBodyText(response,100000);
    let payload=null;
    if(raw!==null)try{payload=JSON.parse(raw);}catch{/* Valid HTTP, invalid JSON: mismatch, not unknown network. */}
    const expected=expectedShareRows(campaign);
    matches=isObject(payload)&&payload.campaignId===campaign.campaignId&&
      payload.landingUrl===campaign.canonicalUrl&&Array.isArray(payload.items)&&
      payload.items.length===expected.length&&expected.every(item=>payload.items.some(actual=>
       actual?.channel===item.channel&&actual?.medium===item.medium&&
       actual?.shareUrl===item.shareUrl&&actual?.paymentLinkId===item.paymentLinkId));
   }
   return {name,requestPath:url.pathname,outcome:matches?"matched":"mismatched",httpStatus:response.status};
  }catch{
   // A network problem is UNKNOWN, not proof of no deployment. Do not log
   // response text, cookies, credentials, or a Stripe Checkout destination.
   return {name,requestPath:url.pathname,outcome:"unobserved",httpStatus:null};
  }
 }));
 const publicRouteReceiving=checks.every(check=>check.outcome==="matched")?"passed":
  checks.some(check=>check.outcome==="mismatched")?"failed":"unknown";
 // A known Worker source-handler signature narrows release investigation when
 // support routes fail. Absence does not distinguish DNS, custom-domain, older
 // code, static assets or a different Worker without provider-owned evidence.
 const workerSignature=publicRouteReceiving==="passed"?null:
  await workerHandlerSignature(fetcher,origin,timeoutMs);
 const installationInvestigation=publicRouteReceiving==="passed"?"not-needed":
  workerSignature.outcome==="matched"?"known-worker-handler-seen-support-incomplete":
  workerSignature.outcome==="mismatched"?"known-worker-handler-not-seen":"network-or-host-unobserved";
 return {
  type:"ShopPublicSupportBuyerRouteObservation",schemaVersion:1,
  observedAt:now(),origin,sourceCampaignId:campaign.campaignId,
  publicRouteReceiving,checks,workerSignature,installationInvestigation,
  exactDeployedRevisionReceived:false,
  paymentAuthorizationAttempted:false,
  stripeCheckoutFollowed:false,
  customerAcceptedDelivery:null,
  groupAfterCostSettledProceedsCents:null
 };
}
