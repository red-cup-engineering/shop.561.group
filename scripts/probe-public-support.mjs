#!/usr/bin/env node
/** Live, public, read-only Shop support-route probe. No secret or payment API. */
import {campaign} from "../src/support-campaign.mjs";
import {probePublicSupport} from "../src/support-public-probe.mjs";

if(process.argv.length>2){
 console.error("Usage: node scripts/probe-public-support.mjs");
 process.exitCode=2;
}else{
 try{
  const receipt=await probePublicSupport({campaign});
  process.stdout.write(JSON.stringify(receipt,null,2)+"\n");
  if(receipt.publicRouteReceiving!=="passed")process.exitCode=1;
 }catch{
  console.error("Public Shop probe refused malformed source campaign; no buyer action attempted.");
  process.exitCode=2;
 }
}
