import test from "node:test";
import assert from "node:assert/strict";
import {serviceMarketX402RelayResponse as relay} from "../src/service-market-x402-relay.mjs";

const SKU="ni:///sha-256;"+"A".repeat(43);
const SHOP="https://shop.561.group";
const SELLER="https://market.561.group";
const endpoint=SELLER+"/v1/accepted-compute";

function sellerCatalog(method="POST",url=endpoint){
  return {recordType:"561-group.x402-market-catalog",market:SELLER,
    settlement:{protocol:"x402"},offers:[{sku:SKU,name:"Accepted compute",
    listed:true,method,url,price:"$0.02",
    seller:{enterprise:"561 Group",privateKey:"never-exposed"},
    request:{bodySchema:{type:"object",properties:{n:{type:"integer"}}}},
    output:{schema:{type:"object",properties:{result:{type:"integer"}}}}}]};
}
function shopRequest(method="POST",options={}){
  const headers=new Headers(options.headers??{});
  if(method==="POST" && !headers.has("content-type")) headers.set("content-type","application/json");
  return new Request(SHOP+"/services/execute?sku="+encodeURIComponent(SKU),{
    method,headers,...(method==="POST"?{body:options.body??"{}"}:{}),
  });
}
function supply({catalog=sellerCatalog(),resourceResponse,fail=false}={}){
  const calls=[];
  const fetchSource=async(address,init)=>{
    const url=new URL(address);
    calls.push({url:url.href,method:init.method,headers:new Headers(init.headers),
      redirect:init.redirect,credentials:init.credentials,body:init.body});
    assert.equal(url.origin,SELLER);
    if(url.pathname==="/v1/catalog") return Response.json(catalog);
    if(fail) throw new Error("private original seller network failure");
    return resourceResponse??new Response(JSON.stringify({error:"pay first"}),{
      status:402,headers:{"content-type":"application/json",
        "payment-required":"seller-original-challenge"}});
  };
  return {calls,fetchSource};
}
test("unsigned Shop POST relays an original seller 402 without authorizing payment",async()=>{
  const {calls,fetchSource}=supply();
  const response=await relay(shopRequest(),{fetchSource});
  assert.equal(response.status,402);
  assert.equal(response.headers.get("payment-required"),"seller-original-challenge");
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(calls.length,2);
  assert.equal(calls[0].method,"GET");
  assert.match(calls[0].url,/\/v1\/catalog\?query=ni%3A/);
  assert.equal(calls[0].headers.has("payment-signature"),false);
  assert.equal(calls[1].url,endpoint);
  assert.equal(calls[1].method,"POST");
  assert.equal(calls[1].redirect,"manual");
  assert.equal(calls[1].credentials,"omit");
  assert.equal(new TextDecoder().decode(calls[1].body),"{}");
});
test("signed Shop request forwards only exact original seller payment headers, response and receipt",async()=>{
  const {calls,fetchSource}=supply({resourceResponse:new Response('{"result":23}',{
    status:200,headers:{"payment-response":"original-market-receipt",
    "content-type":"application/json","set-cookie":"private-seller-session"}})});
  const request=shopRequest("POST",{headers:{
    "payment-signature":"original-buyer-authorization",
    "x-payment-recovery":"buyer-original-recovery",
    "authorization":"Bearer secret-do-not-forward",
    "cookie":"private-shop-session",
    "x-custom-wallet":"unexpected",
  },body:'{"n":23}'});
  const response=await relay(request,{fetchSource});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{result:23});
  assert.equal(response.headers.get("payment-response"),"original-market-receipt");
  assert.equal(response.headers.get("set-cookie"),null);
  assert.equal(calls[1].headers.get("payment-signature"),"original-buyer-authorization");
  assert.equal(calls[1].headers.get("x-payment-recovery"),"buyer-original-recovery");
  for(const name of ["cookie","authorization","x-custom-wallet"])
    assert.equal(calls[1].headers.has(name),false);
  assert.equal(calls[0].headers.has("payment-signature"),false);
  assert.equal(new TextDecoder().decode(calls[1].body),'{"n":23}');
});
test("original GET method works; method substitution is refused",async()=>{
  const {calls,fetchSource}=supply({catalog:sellerCatalog("GET")});
  const denied=await relay(shopRequest("POST"),{fetchSource});
  assert.equal(denied.status,405);
  assert.equal(denied.headers.get("allow"),"GET");
  assert.equal(calls.length,1);
  const get=await relay(shopRequest("GET"),{fetchSource});
  assert.equal(get.status,402);
  assert.equal(calls.at(-1).method,"GET");
  assert.equal(calls.at(-1).body,undefined);
});
test("invalid SKU, repeated parameters and wrong Shop origin fail without original seller reads",async()=>{
  const {calls,fetchSource}=supply();
  for(const url of [
    SHOP+"/services/execute?sku=bad",
    SHOP+"/services/execute?sku="+encodeURIComponent(SKU)+"&extra=hello",
    SHOP+"/services/execute?sku="+encodeURIComponent(SKU)+"&sku="+encodeURIComponent(SKU),
    "https://evil.example/services/execute?sku="+encodeURIComponent(SKU),
  ]){
    const response=await relay(new Request(url),{fetchSource});
    assert.equal(response.status,400);
  }
  assert.equal(calls.length,0);
});
test("unsupported method and ambiguous signature are refused before source reads",async()=>{
  const {calls,fetchSource}=supply();
  assert.equal((await relay(new Request(SHOP+"/services/execute?sku="+encodeURIComponent(SKU),{method:"DELETE"}),{fetchSource})).status,405);
  const ambiguous=shopRequest("POST",{headers:{"payment-signature":"one","x-payment":"two"}});
  assert.equal((await relay(ambiguous,{fetchSource})).status,400);
  const badType=shopRequest("POST",{headers:{"content-type":"text/plain"}});
  assert.equal((await relay(badType,{fetchSource})).status,400);
  assert.equal(calls.length,0);
});
test("oversized buyer input is refused before any market read",async()=>{
  const {calls,fetchSource}=supply();
  const result=await relay(shopRequest("POST",{body:"x".repeat(65537)}),{fetchSource});
  assert.equal(result.status,413);
  assert.equal(calls.length,0);
});
test("cross-origin forged seller, missing offer and unavailable catalog cannot become a purchase",async()=>{
  const forgery=supply({catalog:sellerCatalog("POST","https://example.net/private")});
  assert.equal((await relay(shopRequest(),{fetchSource:forgery.fetchSource})).status,503);
  assert.equal(forgery.calls.length,1);
  const missing=supply({catalog:{...sellerCatalog(),offers:[]}});
  assert.equal((await relay(shopRequest(),{fetchSource:missing.fetchSource})).status,404);
  assert.equal(missing.calls.length,1);
  const unavailable=supply();
  const noCatalog=async()=>{throw new Error("seller down")};
  assert.equal((await relay(shopRequest(),{fetchSource:noCatalog})).status,503);
});
test("original seller redirects are refused without following or synthesizing a sale",async()=>{
  const {calls,fetchSource}=supply({resourceResponse:new Response(null,{
    status:302,headers:{location:"https://example.net/collect-wallet"}})});
  const response=await relay(shopRequest(),{fetchSource});
  assert.equal(response.status,502);
  assert.equal(response.headers.get("location"),null);
  assert.equal(calls.length,2);
});
test("signed transport loss is indeterminate and is NEVER automatically retried",async()=>{
  const {calls,fetchSource}=supply({fail:true});
  const response=await relay(shopRequest("POST",{headers:{"payment-signature":"signed"}}),{fetchSource});
  assert.equal(response.status,502);
  assert.match((await response.json()).error,/UNKNOWN.*Do not replay/);
  assert.equal(calls.length,2);
});
test("relay does not invent payment receipt when original seller did not send one",async()=>{
  const {fetchSource}=supply({resourceResponse:Response.json({result:"free"})});
  const response=await relay(shopRequest(),{fetchSource});
  assert.equal(response.status,200);
  assert.equal(response.headers.get("payment-response"),null);
});
