function esc(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

function money(cents){return "$"+(cents/100).toLocaleString("en-US",{maximumFractionDigits:0});}

function validateSupportCampaign(c){
 const slug=v=>typeof v==="string"&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
 const stripeUrl=v=>typeof v==="string"&&/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(v);
 const stripeId=v=>typeof v==="string"&&/^plink_[A-Za-z0-9]+$/.test(v);
 if(!c||c.schemaVersion!==1||!slug(c.campaignId)||c.canonicalUrl!=="https://shop.561.group/support"||c.merchantDisplayName!=="emsenn"||!Array.isArray(c.proof)||c.proof.length<1||c.proof.length>12||!Array.isArray(c.channels)||!c.channels.length||c.channels.length>12||!c.oneTime||!c.monthly||c.oneTime.minCents!==500||c.oneTime.maxCents!==1000000||!Number.isInteger(c.oneTime.presetCents)||c.oneTime.presetCents<c.oneTime.minCents||c.oneTime.presetCents>c.oneTime.maxCents)throw new TypeError("Campaign identity and verified pricing required");
 for(const k of ["title","description","merchantNotice"])if(typeof c[k]!=="string"||c[k].length<15||c[k].length>900)throw new TypeError("Campaign public copy invalid");
 // A different link ID pointing at the same hosted Checkout loses channel attribution
 // and can silently convert a recurring buyer into a one-time supporter.
 // Refuse both identifier and destination reuse before rendering or redirecting.
 const ids=new Set(),urls=new Set();
 for(const [source,link] of Object.entries(c.oneTime.links??{})){if(!slug(source)||!stripeId(link?.id)||!stripeUrl(link?.url)||ids.has(link.id)||urls.has(link.url))throw new TypeError("Stripe links must be distinct source-qualified receivers");ids.add(link.id);urls.add(link.url);}
 if(!c.oneTime.links?.direct||!stripeId(c.monthly.id)||!stripeUrl(c.monthly.url)||c.monthly.priceCents!==1000||c.monthly.interval!=="month"||ids.has(c.monthly.id)||urls.has(c.monthly.url))throw new TypeError("Recurring receiver invalid");
 const sources=new Set();
 for(const channel of c.channels){if(!slug(channel.id)||sources.has(channel.id)||!["referral","social","email"].includes(channel.medium)||typeof channel.pitch!=="string"||channel.pitch.length<30||channel.pitch.length>600)throw new TypeError("Campaign channel invalid");sources.add(channel.id);}
 const proof=new Set();
 for(const row of c.proof){if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.url)||proof.has(row.url)||!row.title||!row.category||!row.description)throw new TypeError("Only distinct observed public work belongs on this campaign");proof.add(row.url);}
 return true;
}

function recognizedSource(value,c){return typeof value==="string"&&(value==="direct"||c.channels.some(ch=>ch.id===value))?value:"direct";}

function paymentLink(c,source){return c.oneTime.links[source]??c.oneTime.links.direct;}

function shareUrl(c,channel){
 const url=new URL(c.canonicalUrl);url.searchParams.set("utm_source",channel.id);url.searchParams.set("utm_medium",channel.medium);url.searchParams.set("utm_campaign",c.campaignId);return url.toString();
}

function campaignSharePack(c){
 validateSupportCampaign(c);
 return {campaignId:c.campaignId,landingUrl:c.canonicalUrl,items:c.channels.map(ch=>({channel:ch.id,medium:ch.medium,shareUrl:shareUrl(c,ch),suggestedCopy:ch.pitch+"\n\n"+shareUrl(c,ch),paymentLinkId:paymentLink(c,ch.id).id,paymentAttribution:c.oneTime.links[ch.id]?"channel-specific":"direct-fallback"}))};
}

function renderBillingSupport(c){
 const subject=encodeURIComponent("561 Group support: billing, cancellation or refund request");
 return `<section aria-labelledby="billing-support"><h2 id="billing-support">Billing, cancellations and refunds</h2><p>These voluntary support payments do not purchase books, services, exclusive rights, or a charitable deduction. Monthly support is ${money(c.monthly.priceCents)}/month until canceled. Check the total amount and any applicable tax or fees at Stripe checkout before authorizing payment.</p><p>To request cancellation, report a billing error, or ask about a refund, use <a href="mailto:emsenn@561.group?subject=${subject}">the merchant's published email</a> or <a href="https://561.group/contact/">private contact intake</a>. Supply a receipt or subscription reference, not a payment-card number or credential. A request is not a completed cancellation or refund until the merchant or payment provider confirms the change.</p></section>`;
}

function renderSupportPage(c,source){
 const works=c.proof.map(p=>`<li><small>${esc(p.category)}</small><h3><a href="${esc(p.url)}" rel="noopener noreferrer">${esc(p.title)}</a></h3><p>${esc(p.description)}</p></li>`).join("");
 const one=`/support/go?kind=one-time&source=${encodeURIComponent(source)}`,month=`/support/go?kind=monthly&source=${encodeURIComponent(source)}`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(c.title)} — 561 Group</title><meta name="description" content="${esc(c.description)}"><link rel="canonical" href="${esc(c.canonicalUrl)}"><meta property="og:title" content="${esc(c.title)}"><meta property="og:description" content="${esc(c.description)}"><style>:root{font-family:system-ui,sans-serif;line-height:1.6;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:#f7f8f6;color:#172a2c}nav,main,footer{max-width:960px;margin:auto;padding:1.2rem 1.5rem}nav{display:flex;gap:1.3rem;flex-wrap:wrap;border-bottom:1px solid #b9caca}main{padding-block:3rem}a{color:#085b67}a:focus-visible{outline:3px solid #b45918;outline-offset:3px}h1{font-size:clamp(2rem,5vw,4rem);line-height:1.1;max-width:800px}h2{margin-top:2.5rem}p{max-width:75ch}.lead{font-size:1.25rem}.actions{display:flex;gap:1rem;flex-wrap:wrap;margin:2rem 0}.button{display:inline-block;border-radius:.4rem;padding:1rem 1.3rem;background:#085b67;color:white;text-decoration:none;font-weight:700}.button.alt{background:transparent;color:#085b67;border:2px solid #085b67}.proof{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:1rem}.proof li{border:1px solid #bacacb;border-radius:.5rem;padding:1rem;background:white}.muted{color:#4c6264;font-size:.9rem}footer{border-top:1px solid #bacacb}@media(prefers-color-scheme:dark){body{background:#101e20;color:#ecf1f0}a{color:#9be0e6}.proof li{background:#1b3033;border-color:#526c70}.muted{color:#c3d6d8}.button{background:#9be0e6;color:#123338}.button.alt{background:none;color:#9be0e6;border-color:#9be0e6}}</style></head><body><nav aria-label="Site navigation"><strong>561 Group · Open Work</strong><a href="/">Shop</a><a href="https://bazaar.561.group/">Bazaar</a><a href="https://market.561.group/">Market</a></nav><main><p>Published in the open. Supported by choice.</p><h1>${esc(c.title)}</h1><p class="lead">${esc(c.description)}</p><div class="actions"><a class="button" href="${esc(one)}">Choose a one-time tip</a><a class="button alt" href="${esc(month)}">Support ${money(c.monthly.priceCents)}/month</a></div><p class="muted">Choose any one-time amount from ${money(c.oneTime.minCents)} to ${money(c.oneTime.maxCents)}; Stripe suggests ${money(c.oneTime.presetCents)}. For larger patronage, <a href="https://561.group/contact/">get in touch</a>. Monthly support renews until canceled.</p><section aria-labelledby="proof"><h2 id="proof">Inspect what already exists</h2><p>Real, publicly accessible work from Science, Engineering and Public Services—not a pitch deck.</p><ul class="proof">${works}</ul></section><section><h2>Help make the future more open</h2><p>We keep publishing usable software, methods and research in public. Each project's original license and governance still apply, regardless of who sends appreciation.</p><p class="muted">${esc(c.merchantNotice)}</p></section>${renderBillingSupport(c)}</main><footer><small>Checkout data observed ${esc(c.observedOn)} · <a href="/support/share.json">Machine-readable campaign share pack</a> · <a href="https://github.com/561-group/.github/blob/main/TIPS.md">Other tip rails</a> · <a href="https://561.group/contact/">Contact</a>. No trackers or cookies are used by this page.</small></footer></body></html>`;
}

function supportResponse(request,c){
 validateSupportCampaign(c);
 const url=new URL(request.url);
 if(!["GET","HEAD"].includes(request.method))return new Response(null,{status:405,headers:{allow:"GET, HEAD"}});
 const source=recognizedSource(url.searchParams.get(url.pathname==="/support/go"?"source":"utm_source"),c);
 if(url.pathname==="/support/go"){
  const kind=url.searchParams.get("kind");if(!["one-time","monthly"].includes(kind))return new Response("Offer not found",{status:404});
  return new Response(null,{status:303,headers:{location:kind==="monthly"?c.monthly.url:paymentLink(c,source).url,"cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"}});
 }
 if(url.pathname==="/support/share.json")return new Response(request.method==="HEAD"?null:JSON.stringify(campaignSharePack(c)),{status:200,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","cache-control":"public, max-age=120","x-content-type-options":"nosniff"}});
 if(!["/support","/support/"].includes(url.pathname))return new Response("Not found",{status:404});
 return new Response(request.method==="HEAD"?null:renderSupportPage(c,source),{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=120","referrer-policy":"no-referrer","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}
export { validateSupportCampaign, campaignSharePack, supportResponse };
