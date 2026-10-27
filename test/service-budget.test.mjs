import test from "node:test";
import assert from "node:assert/strict";
import {ORIGINAL_MARKET_BASKET_URL,serviceBudgetResponse,admitOriginalMarketBasket,
  renderOriginalMarketBudgetPage} from "../src/service-budget.mjs";
import {routeServiceDiscovery,renderServiceOfferPage,projectOriginalMarketServices} from "../src/service-discovery.mjs";
import {admitServiceComparison,renderServiceComparisonHTML} from "../src/service-comparison.mjs";

const a="ni:///sha-256;"+"A".repeat(43);
const b="ni:///sha-256;"+"B".repeat(43);
const c="ni:///sha-256;"+"C".repeat(43);
const scope={skus:[a,b],counts:[2,1],maximum:"5100"};
const original=(overrides={})=>({
  kind:"x402.market.basket-preview.v1",state:"within-advertised-ceiling",
  complete:true,withinAdvertisedCeiling:true,
  pricedSubtotalAtomic:"5100",advertisedTotalAtomic:"5100",
  settlement:{network:"eip155:8453",asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"},
  lines:[
    {sku:a,calls:2,state:"fixed-price-preview",extendedAmountAtomic:"3000",cell:"ni:source-a",law:"ni:law-a"},
    {sku:b,calls:1,state:"fixed-price-preview",extendedAmountAtomic:"2100",cell:"ni:source-b",law:"ni:law-b"},
  ],
  paymentAuthorized:false,purchaseExecuted:false,deliveryReceived:false,
  sellerPrivateKey:"NEVER-PUBLISH-THIS",
  ...overrides,
});
const path=(pair=scope,route="/services/basket")=>{
  const qs=new URLSearchParams();
  pair.skus.forEach((sku,i)=>{qs.append("sku",sku);qs.append("calls",String(pair.counts[i]));});
  qs.set("maxTotalAtomic",pair.maximum);
  return "https://shop.561.group"+route+"?"+qs;
};
const serve=(value=original(),calls=[])=>async(address,options)=>{
  calls.push({address,options});return Response.json(value);
};
const read=(pair=scope,options={})=>serviceBudgetResponse(new Request(path(pair)),options);

test("source-qualified budget carries exact EVM atomic-unit claims but no wallet authority",()=>{
  const source=original(),before=structuredClone(source);
  const value=admitOriginalMarketBasket(source,scope);
  assert.equal(value.recordType,"561-group.shop.original-market-budget.v1");
  assert.equal(value.pricedSubtotalAtomic,"5100");
  assert.equal(value.advertisedTotalAtomic,"5100");
  assert.equal(value.withinAdvertisedCeiling,true);
  assert.equal(value.lines[0].extendedAmountAtomic,"3000");
  assert.equal(value.lines[1].extendedAmountAtomic,"2100");
  assert.equal(value.lines[1].calls,1);
  assert.equal(value.lines[0].sourceCell,"ni:source-a");
  assert.deepEqual(value.settlement,source.settlement);
  assert.equal(value.paymentAuthorized,false);
  assert.equal(value.purchaseExecuted,false);
  assert.equal(value.deliveryReceived,false);
  assert.equal(JSON.stringify(value).includes("NEVER-PUBLISH-THIS"),false);
  assert.equal(Object.isFrozen(value.lines[0]),true);
  assert.deepEqual(source,before);
});

test("incomplete or variable source pricing remains null and does not become a zero-dollar quote",()=>{
  const broken=original({state:"incomplete",complete:false,
    withinAdvertisedCeiling:null,advertisedTotalAtomic:null,
    pricedSubtotalAtomic:"3000",
    lines:[original().lines[0],{
      sku:b,calls:1,state:"not-fixed-price",extendedAmountAtomic:null,
    }]
  });
  const result=admitOriginalMarketBasket(broken,scope);
  assert.equal(result.complete,false);
  assert.equal(result.advertisedTotalAtomic,null);
  assert.equal(result.withinAdvertisedCeiling,null);
  const html=renderOriginalMarketBudgetPage(result,scope);
  assert.match(html,/Incomplete; at least one item cannot be priced/);
  assert.match(html,/Unknown: incomplete source pricing/);
  assert.match(html,/Unknown or variable/);
  assert.doesNotMatch(html,/\$0\.00|Payment authorized|Pay now/);
});

test("one fixed original Market budget call uses ordered paired identities and a single source ceiling",async()=>{
  const calls=[];
  const response=await read(scope,{fetchSource:serve(original(),calls)});
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  const url=new URL(calls[0].address);
  assert.equal(url.origin+url.pathname,ORIGINAL_MARKET_BASKET_URL);
  assert.equal(url.searchParams.toString(),new URL(path(scope)).searchParams.toString());
  assert.deepEqual(url.searchParams.getAll("sku"),[a,b]);
  assert.deepEqual(url.searchParams.getAll("calls"),["2","1"]);
  assert.equal(url.searchParams.get("maxTotalAtomic"),"5100");
  assert.equal(calls[0].options.method,"GET");
  assert.equal(calls[0].options.redirect,"manual");
  assert.equal(calls[0].options.credentials,"omit");
  assert.equal(calls[0].options.headers.accept,"application/json");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[0].options.headers["PAYMENT-SIGNATURE"],undefined);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const html=await response.text();
  assert.match(html,/<caption>Original Market budget lines<\/caption>/);
  assert.match(html,/eip155:8453/);
  assert.match(html,/5100/);
  assert.match(html,/not USD|not a price quote|not dollars/i);
});

test("human budget and machine budget project exactly the same original source",async()=>{
  const human=await serviceBudgetResponse(new Request(path()),{fetchSource:serve()});
  const agent=await serviceBudgetResponse(new Request(path(scope,"/services/basket.json")),{fetchSource:serve()});
  assert.equal(human.status,200);assert.equal(agent.status,200);
  assert.match(human.headers.get("content-type"),/html/);
  assert.match(agent.headers.get("content-type"),/json/);
  const value=await agent.json(),html=await human.text();
  assert.equal(value.maximumTotalAtomic,"5100");
  assert.deepEqual(value.lines.map(x=>x.sku),[a,b]);
  assert.equal(value.interpretation.includes("signed payment"),true);
  assert.equal(JSON.stringify(value).includes("NEVER-PUBLISH-THIS"),false);
  assert.match(html,/Original Market budget lines/);
  assert.equal(agent.headers.get("access-control-allow-origin"),"*");
  assert.match(human.headers.get("content-security-policy"),/default-src 'none'/);
});

test("unselected budget form requires original asset base-unit ceiling but makes no source request",async()=>{
  for(const address of ["https://shop.561.group/services/basket",
    "https://shop.561.group/services/basket?sku="+encodeURIComponent(a)]){
    const r=await serviceBudgetResponse(new Request(address),{fetchSource:async()=>{throw Error("unexpected source read")}});
    assert.equal(r.status,200);
    const html=await r.text();
    assert.match(html,/Maximum original seller asset units/);
    assert.match(html,/without a wallet/);
  }
  const machine=await serviceBudgetResponse(new Request("https://shop.561.group/services/basket.json"));
  assert.equal(machine.status,400);
});

test("invalid numeric ceilings, counts, unknown query keys and excessive calls refuse before seller",async()=>{
  const variants=[
    "?sku="+encodeURIComponent(a)+"&calls=0&maxTotalAtomic=0",
    "?sku="+encodeURIComponent(a)+"&calls=1&maxTotalAtomic=01",
    "?sku="+encodeURIComponent(a)+"&calls=1&maxTotalAtomic=-1",
    "?sku="+encodeURIComponent(a)+"&calls=1&maxTotalAtomic=100&maxTotalAtomic=20",
    "?sku="+encodeURIComponent(a)+"&calls=2&sku="+encodeURIComponent(a)+"&calls=1&maxTotalAtomic=1000",
    "?sku="+encodeURIComponent(a)+"&calls=101&maxTotalAtomic=1000",
    "?sku="+encodeURIComponent(a)+"&calls=1&who=admin&maxTotalAtomic=1000",
    "?sku="+encodeURIComponent(a)+"&calls=1&sku="+encodeURIComponent(b)+"&calls=100&maxTotalAtomic=1000",
    "?sku="+encodeURIComponent(a)+"&maxTotalAtomic=100&calls=1&calls=2",
  ];
  for(const suffix of variants){
    let called=0;
    const r=await serviceBudgetResponse(new Request("https://shop.561.group/services/basket"+suffix),{
      fetchSource:async()=>{called++;throw Error("invalid buyer mutated source")},
    });
    assert.equal(r.status,400,suffix);assert.equal(called,0);
  }
});

test("original basket refuses source arithmetic identities that contradict buyer selection",()=>{
  for(const mutate of [
    o=>{o.lines[0].sku=c;},
    o=>{o.lines[0].calls=3;},
    o=>{o.lines[0].extendedAmountAtomic="01";},
    o=>{o.lines.pop();},
    o=>{o.paymentAuthorized=true;},
    o=>{o.purchaseExecuted=true;},
    o=>{o.deliveryReceived=true;},
    o=>{o.maximumTotalAtomic="99999";},
    o=>{o.withinAdvertisedCeiling="true";},
    o=>{o.pricedSubtotalAtomic="-10";},
  ]){
    const bad=original();mutate(bad);
    assert.throws(()=>admitOriginalMarketBasket(bad,scope),TypeError);
  }
});

test("unknown source and supplier errors are not converted to a zero-priced basket",async()=>{
  const failures=[
    async()=>Response.json({error:"seller not ready"},{status:503}),
    async()=>new Response("<html>moved</html>",{status:302,headers:{location:"https://other.example"}}),
    async()=>new Response("<p>not JSON</p>",{headers:{"content-type":"text/html"}}),
    async()=>Response.json({...original(),lines:[original().lines[0]]}),
    async()=>{throw Error("unavailable")},
  ];
  for(const fetchSource of failures){
    const response=await read(scope,{fetchSource});
    assert.equal(response.status,503);
    const body=await response.json();
    assert.match(body.error,/unavailable/i);
    assert.equal(JSON.stringify(body).includes("0.00"),false);
  }
});

test("huge original seller budget streams are cut off before buffering full upstream",async()=>{
  let cancelled=false;
  const streamed=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(4_000_001));},
    cancel(){cancelled=true;}
  }),{headers:{"content-type":"application/json"}});
  const response=await read(scope,{fetchSource:async()=>streamed});
  assert.equal(response.status,503);
  assert.equal(cancelled,true);
});

test("HEAD is read-only and POST refuses before payment or supplier invocation",async()=>{
  const head=await serviceBudgetResponse(new Request(path(scope),{method:"HEAD"}),{fetchSource:serve()});
  assert.equal(head.status,200);
  assert.equal(await head.text(),"");
  assert.equal(head.headers.get("payment-required"),null);
  const post=await serviceBudgetResponse(new Request(path(scope),{method:"POST"}),{
    fetchSource:async()=>{throw Error("unsafe write")},
  });
  assert.equal(post.status,405);
  assert.equal(post.headers.get("allow"),"GET, HEAD");
});

test("original seller source text cannot insert active HTML into the budget table",()=>{
  const bad=original();
  bad.lines[0].state="<script>never</script>";
  const html=renderOriginalMarketBudgetPage(admitOriginalMarketBasket(bad,scope),scope);
  assert.match(html,/&lt;script&gt;never&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});

test("one Shop controller routes native basket while leaving books, fulfillment and original Sales untouched",async()=>{
  let count=0;
  const result=routeServiceDiscovery(new Request(path()),{
    fetchSource:async u=>{count++;assert.ok(u.startsWith(ORIGINAL_MARKET_BASKET_URL));return Response.json(original());},
  });
  assert.equal((await result).status,200);
  assert.equal(count,1);
  for(const route of ["/","/goods/book","/webhooks/stripe","/mcp"]){
    assert.equal(routeServiceDiscovery(new Request("https://shop.561.group"+route),{
      fetchSource:async()=>{throw Error("unrelated original runtime stolen")},
    }),null);
  }
});

test("offer detail and original comparison offer a wallet-free budget entrance",()=>{
  const catalog={
    recordType:"561-group.x402-market-catalog",market:"https://market.561.group",
    settlement:{protocol:"x402"},offers:[{sku:a,name:"Source API",listed:true,method:"POST",
      url:"https://market.561.group/v1/source"}]
  };
  const offer=projectOriginalMarketServices(catalog).services[0];
  const html=renderServiceOfferPage({
    source:{market:"https://market.561.group"},offer,
    qualifications:{listing:"original",checkout:"original"},
  });
  assert.match(html,/action="\/services\/basket"/);
  assert.match(html,/Preview without payment/);
  const compared=admitServiceComparison({
    kind:"x402.market.offer-comparison.v1",requestedSkus:[a,b],
    offers:[{sku:a,name:"A",method:"POST",operation:"read",pricePreview:"$0.02"},
            {sku:b,name:"B",method:"POST",operation:"read",pricePreview:"$0.04"}],
    missingSkus:[],
  },[a,b]);
  const comparison=renderServiceComparisonHTML(compared);
  assert.match(comparison,/action="\/services\/basket"/);
  assert.match(comparison,/Preview an original basket without a wallet/);
});
