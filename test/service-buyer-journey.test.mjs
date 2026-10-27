import test from "node:test";
import assert from "node:assert/strict";
import {routeServiceDiscovery} from "../src/service-discovery.mjs";

const a="ni:///sha-256;"+"A".repeat(43),b="ni:///sha-256;"+"B".repeat(43);
const base="https://shop.561.group";
const offer=(sku,name,amountAtomic)=>({
  sku,name,method:"POST",url:"https://market.561.group/v1/compute",
  operation:"source-compute",gateway:"source-compute",listed:true,
  description:"Source-authored calculation",category:"mathematical",
  price:"$0.03",amountAtomic,request:{bodySchema:{type:"object",required:["input"]}},
  output:{schema:{type:"object",properties:{result:{type:"string"}}}}
});
const catalog={
  recordType:"561-group.x402-market-catalog",market:"https://market.561.group",
  settlement:{protocol:"x402"},offers:[offer(a,"Alpha", "1000"),offer(b,"Beta","2000")],
};
const compared={
  kind:"x402.market.offer-comparison.v1",requestedSkus:[a,b],missingSkus:[],
  offers:[{
    sku:a,name:"Alpha",operation:"source-compute",method:"POST",
    pricePreview:"$0.03",request:catalog.offers[0].request,output:catalog.offers[0].output,
    settlementVerified:false,paidDeliveryVerified:false,
  },{
    sku:b,name:"Beta",operation:"source-compute",method:"POST",
    pricePreview:"$0.03",request:catalog.offers[1].request,output:catalog.offers[1].output,
    settlementVerified:false,paidDeliveryVerified:false,
  }],
};
const budget={
  state:"within-advertised-ceiling",complete:true,withinAdvertisedCeiling:true,
  pricedSubtotalAtomic:"4000",advertisedTotalAtomic:"4000",
  settlement:{network:"eip155:8453",asset:"source-asset"},
  lines:[
    {sku:a,calls:2,state:"fixed-price-preview",extendedAmountAtomic:"2000"},
    {sku:b,calls:1,state:"fixed-price-preview",extendedAmountAtomic:"2000"},
  ],
  paymentAuthorized:false,purchaseExecuted:false,deliveryReceived:false,
};

test("one buyer follows four real Shop source routes without duplicate catalog or payment authority",async()=>{
  const requests=[];
  const readSource=async(address,options)=>{
    const uri=new URL(address);
    requests.push({pathname:uri.pathname,method:options.method,
      credentials:options.credentials,redirect:options.redirect,params:uri.searchParams.toString()});
    assert.equal(uri.origin,"https://market.561.group");
    assert.equal(options.method,"GET");
    assert.equal(options.credentials,"omit");
    assert.equal(options.redirect,"manual");
    if (uri.pathname==="/v1/catalog"){
      return Response.json(catalog);
    }
    if (uri.pathname==="/v1/market/compare"){
      assert.deepEqual(uri.searchParams.getAll("sku"),[a,b]);
      return Response.json(compared);
    }
    if (uri.pathname==="/v1/market/basket"){
      assert.deepEqual(uri.searchParams.getAll("sku"),[a,b]);
      assert.deepEqual(uri.searchParams.getAll("calls"),["2","1"]);
      assert.equal(uri.searchParams.get("maxTotalAtomic"),"4000");
      return Response.json(budget);
    }
    throw new TypeError("Buyer attempted an unapproved original seller route");
  };
  const get=async path=>{
    const result=routeServiceDiscovery(new Request(base+path),{fetchSource:readSource});
    assert.ok(result,"The original Shop source controller must own "+path);
    const response=await result;
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get("payment-required"),null);
    return response.text();
  };
  const directory=await get("/services");
  assert.match(directory,/Alpha/);
  assert.match(directory,/\/services\/offer\?sku=ni%3A%2F%2F%2Fsha-256%3B/);
  assert.match(directory,/Compare original APIs/);
  const detail=await get("/services/offer?sku="+encodeURIComponent(a));
  assert.match(detail,/What this service accepts/);
  assert.match(detail,/Compare this offer with another/);
  assert.match(detail,/Preview without payment/);
  const form=new URLSearchParams();
  form.append("sku",a);form.append("sku",b);
  const comparison=await get("/services/compare?"+form);
  assert.match(comparison,/Alpha/);
  assert.match(comparison,/Beta/);
  assert.match(comparison,/Budget these original API calls/);
  assert.match(comparison,/no resources invoked, payments authorized, or workflows run/i);
  const pairs=new URLSearchParams();
  pairs.append("sku",a);pairs.append("calls","2");
  pairs.append("sku",b);pairs.append("calls","1");
  pairs.set("maxTotalAtomic","4000");
  const planned=await get("/services/basket?"+pairs);
  assert.match(planned,/4000/);
  assert.match(planned,/Original Market budget lines/);
  assert.match(planned,/Plan API calls without a wallet/);
  for(const html of [directory,detail,comparison,planned]){
    assert.match(html,/prefers-color-scheme:dark/);
    assert.match(html,/focus-visible/);
    assert.match(html,/forced-colors:active/);
  }
  assert.deepEqual(requests.map(r=>r.pathname),[
    "/v1/catalog","/v1/catalog","/v1/market/compare","/v1/market/basket"
  ]);
  assert.equal(requests.length,4);
  assert.ok(requests.every(r=>r.method==="GET"&&r.credentials==="omit"));
  assert.doesNotMatch(directory+detail+comparison+planned,/PAYMENT-SIGNATURE|checkout\.session|WalletConnect/);
});
