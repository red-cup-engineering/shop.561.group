import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileSupportCheckouts} from "../src/support-checkout-attribution.mjs";

// Pure classifier contract data: deliberately synthetic. The actual CLI MUST
// import the original private Causeway parameter source, never this fixture.
// Public CI checks refusals/semantics, not private merchant/source admission.
const campaign={
 merchantDisplayName:"synthetic-test-merchant",campaignId:"synthetic-test-campaign",
 oneTime:{links:{
  direct:{id:"plink_SyntheticDirect"},
  github:{id:"plink_SyntheticGithub"},
  fediverse:{id:"plink_SyntheticFediverse"}
 }},
 monthly:{id:"plink_SyntheticMonthly"}
};
const receivers=[
 ...Object.values(campaign.oneTime.links).map(link=>link.id),
 campaign.monthly.id
].map(stripePaymentLinkId=>({
 type:"ExternalStripePaymentLinkReceiver",schemaVersion:1,stripePaymentLinkId,
 stripeMerchantAccountId:"acct_SyntheticTest",
 merchantDisplayName:campaign.merchantDisplayName
}));
const accountId=receivers[0].stripeMerchantAccountId;
const links=campaign.oneTime.links;
const session=(id,paymentLink,status="open",paymentStatus="unpaid",amount=null)=>({
 id:"cs_live_"+id,object:"checkout.session",livemode:true,
 payment_link:paymentLink,status,payment_status:paymentStatus,
 ...(amount===null?{}:{amount_total:amount,currency:"usd"}),
 customer_details:{email:"should-never-escape@example.invalid",name:"PRIVATE BUYER"}
});
const snapshot=(data=[],hasMore=false)=>({
 stripeContext:accountId,livemode:true,observedAt:"2026-10-23T18:30:00Z",
 checkoutSessions:{object:"list",data,has_more:hasMore}
});
const reconcile=observation=>reconcileSupportCheckouts({campaign,receivers,observation});

test("only four source-qualified synthetic Payment Links qualify as Shop support observations",()=>{
 const observation=reconcile(snapshot([]));
 assert.equal(observation.type,"ShopStripeCheckoutAttributionObservation");
 assert.equal(observation.schemaVersion,1);
 assert.equal(observation.sourceMerchant,campaign.merchantDisplayName);
 assert.equal(observation.sourceStripeAccountId,accountId);
 assert.equal(observation.paymentLinks.length,4);
 assert.deepEqual(new Set(observation.paymentLinks.map(row=>row.paymentLinkId)),
  new Set([links.direct.id,links.github.id,links.fediverse.id,campaign.monthly.id]));
 assert.equal(observation.paymentLinks.filter(row=>row.kind==="recurring-start").length,1);
 assert.equal(observation.sourceIsExternalStripeRead,
  "caller-attested-not-independently-authenticated-by-this-script");
});

test("one unpaid hosted checkout is not a customer, payment, conversion or received cash",()=>{
 const report=reconcile(snapshot([session("open1",links.direct.id)]));
 assert.equal(report.inputRowsObserved,1);
 assert.equal(report.paymentLinks.find(row=>row.channel==="direct").openUnpaid,1);
 assert.equal(report.recognizedCompletedPaidCheckoutCount,0);
 assert.equal(report.recognizedCompletedPaidCheckoutGrossCents,0);
 assert.equal(report.groupTreasuryReceivedNetCents,null);
 assert.equal(report.buyerAcceptedDeliveryCount,null);
 assert.equal(report.bankSettledNetCents,null);
});

test("observed paid Checkout is reported only as gross Checkout, not subscription renewal or settlement",()=>{
 const report=reconcile(snapshot([
  session("paid1",links.github.id,"complete","paid",2500),
  session("paid2",campaign.monthly.id,"complete","paid",1000),
  session("withoutcharge",links.fediverse.id,"complete","no_payment_required"),
  session("incomplete",links.direct.id,"complete","unpaid"),
  session("expired",links.direct.id,"expired","unpaid"),
  session("unrelated","plink_Other","complete","paid",2200)
 ]));
 assert.equal(report.recognizedCompletedPaidCheckoutCount,2);
 assert.equal(report.recognizedCompletedPaidCheckoutGrossCents,3500);
 assert.equal(report.unattributedSessionRows,1);
 assert.equal(report.paymentLinks.find(row=>row.channel==="monthly").completedPaid,1);
 assert.equal(report.paymentLinks.find(row=>row.channel==="fediverse").completedNoPaymentRequired,1);
 assert.equal(report.paymentLinks.find(row=>row.channel==="direct").expired,1);
 assert.equal(report.paymentLinks.find(row=>row.channel==="direct").otherStatus,1);
 assert.equal(report.stripeFeesCents,null);
 assert.equal(report.refundsCents,null);
 assert.equal(report.bankSettledNetCents,null);
 assert.equal(report.groupTreasuryReceivedNetCents,null);
 assert.equal(report.buyerAcceptedDeliveryCount,null);
 assert.equal(report.recurringCheckoutIsNotAnActiveOrRenewedSubscription,true);
 assert.ok(!JSON.stringify(report).includes("should-never-escape"));
 assert.ok(!JSON.stringify(report).includes("PRIVATE BUYER"));
});

test("unread Stripe pages are explicit; terminal page means only the supplied response is terminal",()=>{
 const report=reconcile(snapshot([session("open",links.direct.id)],true));
 assert.equal(report.inputCoverage,"additional-pages-unread");
 assert.equal(report.paymentLinks[0].rowsObserved,1);
 assert.equal(reconcile(snapshot([])).inputCoverage,"supplied-terminal-page-only");
});

test("wrong merchant, live/test mixing and unregistered seller records refuse cleanly",()=>{
 const original=snapshot([session("one",links.direct.id)]);
 const variants=[
  {...original,stripeContext:"acct_OTHER"},
  {...original,livemode:false},
  {...original,observedAt:"yesterday"},
  {...original,checkoutSessions:{...original.checkoutSessions,data:[{...original.checkoutSessions.data[0],livemode:false}]}},
  {...original,checkoutSessions:{...original.checkoutSessions,data:[{...original.checkoutSessions.data[0],id:"cs_test_one"}]}},
  {...original,checkoutSessions:{...original.checkoutSessions,data:[original.checkoutSessions.data[0],original.checkoutSessions.data[0]]}},
  {...original,checkoutSessions:{...original.checkoutSessions,has_more:"false"}}
 ];
 for(const variant of variants)assert.throws(()=>reconcile(variant),TypeError);
 assert.throws(()=>reconcileSupportCheckouts({campaign,receivers:receivers.slice(1),observation:original}),TypeError);
 assert.throws(()=>reconcileSupportCheckouts({
  campaign,receivers:receivers.map((r,i)=>i===0?{...r,stripeMerchantAccountId:"acct_ANOTHER"}:r),observation:original
 }),TypeError);
});

test("a claimed paid Checkout requires a safe finite nonnegative USD amount",()=>{
 const paid=session("paid",links.direct.id,"complete","paid",750);
 for(const bad of [null,-1,NaN,Infinity,3.5,Number.MAX_SAFE_INTEGER+1]){
  const variant={...paid,amount_total:bad};
  assert.throws(()=>reconcile(snapshot([variant])),TypeError);
 }
 assert.throws(()=>reconcile(snapshot([{...paid,currency:"eur"}])),TypeError);
});

const perLinkObservation=(dataById={}, unreadIds=[])=>{
 const observation=snapshot([]);
 delete observation.checkoutSessions;
 observation.checkoutSessionsByLink=[
  links.direct.id,links.github.id,links.fediverse.id,campaign.monthly.id
 ].map(paymentLinkId=>({
  paymentLinkId,
  checkoutSessions:{object:"list",data:dataById[paymentLinkId]??[],
   has_more:unreadIds.includes(paymentLinkId)}
 }));
 return observation;
};

test("four source-qualified terminal filtered provider pages preserve independent zero-sale evidence",()=>{
 const evidence=perLinkObservation({
  [links.direct.id]:[session("filteropen",links.direct.id)]
 });
 const report=reconcile(evidence);
 assert.equal(report.inputQueryMode,"separate-caller-attested-payment-link-filtered-lists");
 assert.equal(report.inputCoverage,"source-selected-terminal-link-pages");
 assert.equal(report.inputRowsObserved,1);
 assert.equal(report.unattributedSessionRows,0);
 assert.equal(report.paymentLinks.length,4);
 assert.equal(report.paymentLinks.find(row=>row.channel==="direct").openUnpaid,1);
 assert.equal(report.recognizedCompletedPaidCheckoutCount,0);
 assert.equal(report.recognizedCompletedPaidCheckoutGrossCents,0);
 assert.equal(report.bankSettledNetCents,null);
 assert.equal(report.buyerAcceptedDeliveryCount,null);
 assert.ok(!JSON.stringify(report).includes("should-never-escape"));
 assert.ok(!JSON.stringify(report).includes("PRIVATE BUYER"));
});

test("independent paid filtered pages count only qualified Checkout gross, never subscription renewal or cleared cash",()=>{
 const report=reconcile(perLinkObservation({
  [links.github.id]:[session("paidfiltered",links.github.id,"complete","paid",2500)],
  [campaign.monthly.id]:[session("monthlyfirst",campaign.monthly.id,"complete","paid",1000)]
 }));
 assert.equal(report.inputRowsObserved,2);
 assert.equal(report.recognizedCompletedPaidCheckoutCount,2);
 assert.equal(report.recognizedCompletedPaidCheckoutGrossCents,3500);
 assert.equal(report.paymentLinks.find(row=>row.kind==="recurring-start").completedPaid,1);
 assert.equal(report.recurringCheckoutIsNotAnActiveOrRenewedSubscription,true);
 assert.equal(report.groupTreasuryReceivedNetCents,null);
});

test("filtered page mode keeps incomplete payment-link pagination visible and forbids silent mixing",()=>{
 const partial=reconcile(perLinkObservation({
  [links.direct.id]:[session("pending",links.direct.id)]
 },[links.github.id]));
 assert.equal(partial.inputCoverage,"source-selected-link-pages-unread");
 const mixed=perLinkObservation();
 mixed.checkoutSessions={object:"list",data:[],has_more:false};
 assert.throws(()=>reconcile(mixed),TypeError);
});

test("filtered page mode refuses missing, duplicate, foreign, malformed and mixed-mode provider evidence",()=>{
 const original=perLinkObservation({[links.direct.id]:[session("source",links.direct.id)]});
 const altered=fn=>{
  const candidate=JSON.parse(JSON.stringify(original));
  fn(candidate);
  return candidate;
 };
 const wrong=[
  v=>v.checkoutSessionsByLink.pop(),
  v=>v.checkoutSessionsByLink[0].paymentLinkId=links.github.id,
  v=>v.checkoutSessionsByLink[0].paymentLinkId="plink_UNREGISTERED",
  v=>v.checkoutSessionsByLink[0].checkoutSessions.data[0].payment_link=links.github.id,
  v=>{delete v.checkoutSessionsByLink[0].checkoutSessions.data[0].payment_link;},
  v=>v.checkoutSessionsByLink[0].checkoutSessions.data[0].livemode=false,
  v=>v.checkoutSessionsByLink[0].checkoutSessions.has_more="false",
  v=>v.checkoutSessionsByLink[0].checkoutSessions.data=Array(101).fill(v.checkoutSessionsByLink[0].checkoutSessions.data[0]),
  v=>v.checkoutSessionsByLink[0].checkoutSessions.object="wrong.list",
  v=>v.checkoutSessionsByLink[0].checkoutSessions.data.push(v.checkoutSessionsByLink[0].checkoutSessions.data[0]),
  v=>v.checkoutSessionsByLink.push(v.checkoutSessionsByLink[0])
 ];
 for(const mutate of wrong)
  assert.throws(()=>reconcile(altered(mutate)),TypeError);
 assert.equal(reconcile(original).inputRowsObserved,1);
});

test("original private parameters, not deleted root files, are required by the offline CLI",()=>{
 const code=readFileSync(new URL("../scripts/reconcile-support-checkouts.mjs",import.meta.url),"utf8");
 const probe=readFileSync(new URL("../scripts/probe-public-support.mjs",import.meta.url),"utf8");
 const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
 assert.equal(pkg.imports["#parameters/*"],"./parameters/*");
 assert.match(code,/from "#parameters\/catalog\.json"/);
 assert.match(code,/from "\.\.\/src\/support-campaign\.mjs"/);
 assert.match(probe,/from "\.\.\/src\/support-campaign\.mjs"/);
 assert.doesNotMatch(code,/from "\.\.\/(?:catalog\.json|data\/records\/marketing\/)/);
 assert.doesNotMatch(probe,/from "\.\.\/data\/records\/marketing\//);
});
