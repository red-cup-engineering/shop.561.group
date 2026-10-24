#!/usr/bin/env node
/** Offline, read-only original Shop support checkout reconciliation.
 * Input: a dated merchant-account wrapper around one original Stripe
 * GET /v1/checkout/sessions list response. No credentials, customer data,
 * email, posting, charging or account mutation; no bank settlement claim.
 */
import {readFileSync} from "node:fs";
import {campaign} from "../src/support-campaign.mjs";
import shopCatalog from "#parameters/catalog.json" with {type:"json"};
import {reconcileSupportCheckouts} from "../src/support-checkout-attribution.mjs";

const argument=process.argv[2];
if(!argument||process.argv.length!==3||argument==="--help"){
 console.error("Usage: npm run marketing:reconcile -- <private-observation.json|->");
 console.error("Input: {stripeContext,livemode:true,observedAt,checkoutSessions:<original Stripe GET /v1/checkout/sessions response>}");
 console.error("This report never proves customer acceptance, Stripe fees, payout, bank settlement or Group proceeds.");
 process.exitCode=argument==="--help"?0:2;
}else{
 try{
  const source=readFileSync(argument==="-"?0:argument,"utf8");
  const observation=JSON.parse(source);
  const report=reconcileSupportCheckouts({
   campaign,
   receivers:shopCatalog.externalStripePaymentLinkReceivers,
   observation
  });
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
 }catch{
  // Never echo private imported Checkout Session body or customer identities.
  console.error("Refused: source/account, dated Stripe response, pagination, session or gross qualification failed.");
  process.exitCode=1;
 }
}
