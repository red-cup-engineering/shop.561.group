import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSupportCampaign, campaignSharePack, supportResponse } from "../src/support-campaign-core.mjs";

// Synthetic control, NEVER a claim about installed merchant terms or a real purchase.
const sample = {
  schemaVersion: 1, campaignId: "example-open-work",
  canonicalUrl: "https://shop.561.group/support",
  merchantDisplayName: "emsenn",
  title: "Example independent support campaign",
  description: "An isolated route test with no real offer or contact.",
  merchantNotice: "Example merchant custody remains independent of this test.",
  observedOn: "2026-10-24",
  proof: [{
    url: "https://github.com/causeway-services/public-services-section",
    title: "Example <script>unsafe</script> source evidence",
    category: "Existing research", description: "This example must never execute HTML.",
  }],
  channels: [
    {id:"github",medium:"referral",pitch:"A synthetic referral used only to verify a deterministic share link."},
    {id:"email",medium:"email",pitch:"A synthetic email source used only for validation, not contact."},
  ],
  oneTime: {
    minCents:500,maxCents:1000000,presetCents:25000,
    links:{
      direct:{id:"plink_SyntheticDirect",url:"https://buy.stripe.com/SyntheticDirect"},
      github:{id:"plink_SyntheticGitHub",url:"https://buy.stripe.com/SyntheticGitHub"},
    },
  },
  monthly:{id:"plink_SyntheticMonthly",url:"https://buy.stripe.com/SyntheticMonthly",priceCents:1000,interval:"month"},
};
const copy = () => structuredClone(sample);
const get = (path, init={}, input=copy()) =>
  supportResponse(new Request("https://shop.561.group"+path,init),input);

test("the real route maker is importable and testable without the private merchant Gitlink",()=>{
  const core=readFileSync(new URL("../src/support-campaign-core.mjs",import.meta.url),"utf8");
  assert.equal(core.includes("#parameters"),false);
  assert.equal(validateSupportCampaign(copy()),true);
});
test("selected source redirects only to source-qualified allowlisted provider links",()=>{
  assert.equal(get("/support/go?kind=one-time&source=github&next=https://evil.invalid/").headers.get("location"),sample.oneTime.links.github.url);
  assert.equal(get("/support/go?kind=one-time&source=unknown").headers.get("location"),sample.oneTime.links.direct.url);
  const monthly=get("/support/go?kind=monthly&source=github");
  assert.equal(monthly.status,303);
  assert.equal(monthly.headers.get("location"),sample.monthly.url);
  assert.equal(monthly.headers.get("cache-control"),"no-store");
  assert.equal(monthly.headers.get("referrer-policy"),"no-referrer");
});
test("unauthorized methods and unknown commercial kind never redirect",()=>{
  assert.equal(get("/support",{method:"POST"}).status,405);
  assert.equal(get("/support/go",{method:"POST"}).status,405);
  assert.equal(get("/support/go?kind=unapproved").status,404);
  assert.equal(get("/support/unknown").status,404);
  const head=get("/support",{method:"HEAD"});
  assert.equal(head.status,200);
});
test("public HTML escapes source-controlled text and carries no secret or tracker",async()=>{
  const page=get("/support?utm_source=github");
  assert.equal(page.status,200);
  assert.equal(page.headers.get("set-cookie"),null);
  const html=await page.text();
  assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;"));
  assert.equal(html.includes("<script>unsafe</script>"),false);
  assert.ok(html.includes("href=\"/support/go?kind=one-time&amp;source=github\""));
  assert.ok(html.includes("Billing, cancellations and refunds"));
});
test("share pack preserves attribution and never performs a remote payment",async()=>{
  const pack=campaignSharePack(copy());
  const byId=Object.fromEntries(pack.items.map(x=>[x.channel,x]));
  assert.equal(byId.github.paymentAttribution,"channel-specific");
  assert.equal(byId.email.paymentAttribution,"direct-fallback");
  assert.equal(new URL(byId.github.shareUrl).searchParams.get("utm_source"),"github");
  const reply=await get("/support/share.json").json();
  assert.deepEqual(reply,pack);
});
test("changed merchant, forged URLs and repeated receiver IDs fail before any route",()=>{
  const changes=[
    c=>{c.merchantDisplayName="another-payee";},
    c=>{c.oneTime.links.github.url="https://evil.invalid/checkout";},
    c=>{c.oneTime.links.github.id=c.oneTime.links.direct.id;},
    // Distinct opaque IDs do not make a reused hosted Checkout destination safe.
    c=>{c.oneTime.links.github.url=c.oneTime.links.direct.url;},
    c=>{c.monthly.url=c.oneTime.links.direct.url;},
    c=>{c.monthly.priceCents=900;},
    c=>{c.proof.push({...c.proof[0]});},
  ];
  for(const change of changes){
    const c=copy(); change(c);
    assert.throws(()=>validateSupportCampaign(c),TypeError);
    assert.throws(()=>supportResponse(new Request("https://shop.561.group/support"),c),TypeError);
  }
});
