import test from "node:test";
import assert from "node:assert/strict";
import {
  ORIGINAL_MARKET_COMPARISON_URL,admitServiceComparison,
  renderServiceComparisonHTML,serviceCompareResponse
} from "../src/service-comparison.mjs";
import {routeServiceDiscovery,renderServiceOfferPage,projectOriginalMarketServices} from "../src/service-discovery.mjs";

const a="ni:///sha-256;"+"A".repeat(43);
const b="ni:///sha-256;"+"B".repeat(43);
const c="ni:///sha-256;"+"C".repeat(43);
const d="ni:///sha-256;"+"D".repeat(43);
const sourceOffer=(sku,name)=>({
  sku,name,operation:"original-operation",method:"POST",
  pricePreview:"$0.04",description:"Example <script>unsafe</script> & markup",
  category:"evidence",sellerEnterprise:"561 Group",producerDeclaration:{package:"@source/seller"},
  sourceRightsVerification:"unassayed",
  request:{bodySchema:{type:"object",required:["site"],properties:{site:{type:"string"}}}},
  output:{schema:{type:"object",properties:{evidence:{type:"string"}}}},
  settlementVerified:false,paidDeliveryVerified:false,
  hiddenSecret:"MUST_NOT_LEAK",payee:"PRIVATE_PAYEE",
});
const original=(skus=[a,b],options={})=>({
  kind:"x402.market.offer-comparison.v1",
  requestedSkus:skus,
  offers:skus.filter(sku=>sku!==c).map(sku=>sourceOffer(sku,sku===a?"A & API":"B <audit>")),
  missingSkus:skus.filter(sku=>sku===c),
  basis:"Original seller original sample, not proof of commercial equivalence",
  ...(options.withSample?{sampleComposition:{
    kind:"x402.market.sample-composition-reading.v1",
    complete:true,authorizesExecution:false,
    sampleAdmittedLinks:[{
      from:a,to:b,contractualCompositionProven:false,executionAuthorized:false
    }],
  }}:{}),
});
const url=(skus=[a,b],route="/services/compare")=>
  "https://shop.561.group"+route+"?"+new URLSearchParams(skus.map(sku=>["sku",sku]));
const serve=(source=original(),calls=[])=>async(address,options)=>{
  calls.push({address,options});return Response.json(source);
};
const response=(skus=[a,b],params={})=>
  serviceCompareResponse(new Request(url(skus)),params);

test("original Market, not Shop, determines source comparison, order and price previews",()=>{
  const reading=admitServiceComparison(original([b,a]),[b,a]);
  assert.equal(reading.recordType,"561-group.shop.original-service-comparison.v1");
  assert.deepEqual(reading.requestedSkus,[b,a]);
  assert.deepEqual(reading.offers.map(row=>row.sku),[b,a]);
  assert.equal(reading.offers[1].pricePreview,"$0.04");
  assert.equal(reading.offers[1].sourceRightsVerification,"unassayed");
  assert.equal(reading.sampleComposition,null);
  assert.equal(reading.offers[1].originalDetail,"/services/offer?sku="+encodeURIComponent(a));
  assert.equal(Object.isFrozen(reading),true);
  for(const secret of ["MUST_NOT_LEAK","PRIVATE_PAYEE"]){
    assert.equal(JSON.stringify(reading).includes(secret),false);
  }
});

test("missing or held SKU is explicit, not given an invented seller or price",()=>{
  const reading=admitServiceComparison(original([a,c,b]),[a,c,b]);
  assert.deepEqual(reading.offers.map(x=>x.sku),[a,b]);
  assert.deepEqual(reading.missingSkus,[c]);
  assert.equal(JSON.stringify(reading).includes("hiddenSecret"),false);
});

test("source identity disagreement fails closed instead of becoming buyer comparison",()=>{
  for(const edit of [
    reading=>{reading.kind="other";},
    reading=>{reading.requestedSkus=[b,a];},
    reading=>{reading.offers[0].sku=d;},
    reading=>{reading.offers[0].name="";},
    reading=>{reading.offers[0].pricePreview={money:"made up"};},
    reading=>{reading.offers.push({...reading.offers[0]});},
    reading=>{reading.missingSkus=[a];},
    reading=>{reading.missingSkus=[c];},
    reading=>{reading.offers=[reading.offers[0]];},
  ]){
    const record=structuredClone(original());
    edit(record);
    assert.throws(()=>admitServiceComparison(record,[a,b]),TypeError);
  }
});

test("original bounded source-example relationships remain explicitly nonoperative",()=>{
  const source=original([a,b],{withSample:true});
  const reading=admitServiceComparison(source,[a,b]);
  assert.equal(reading.sampleComposition.kind,"x402.market.sample-composition-reading.v1");
  assert.equal(reading.sampleComposition.links.length,1);
  assert.equal(reading.sampleComposition.links[0].executionAuthorized,false);
  assert.equal(reading.sampleComposition.authorizesExecution,false);
  const corrupted=structuredClone(source);
  corrupted.sampleComposition.sampleAdmittedLinks[0].executionAuthorized=true;
  assert.throws(()=>admitServiceComparison(corrupted,[a,b]),TypeError);
  corrupted.sampleComposition.sampleAdmittedLinks[0].executionAuthorized=false;
  corrupted.sampleComposition.sampleAdmittedLinks[0].to=c;
  assert.throws(()=>admitServiceComparison(corrupted,[a,b]),TypeError);
});

test("one buyer page presents accessible original contract comparison without script or checkout",()=>{
  const html=renderServiceComparisonHTML(admitServiceComparison(original([a,b],{withSample:true}),[a,b]));
  assert.match(html,/<caption>Source-declared information for 2 publicly listed offers<\/caption>/);
  assert.match(html,/aria-label="Source service comparison, scroll horizontally if needed"/);
  assert.match(html,/<th scope="row">Request input<\/th>/);
  assert.match(html,/Catalog price preview/);
  assert.match(html,/B &lt;audit&gt;/);
  assert.match(html,/Example &lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(html,/source example|original example|Original example|source-example/i);
  assert.match(html,/no resources invoked|no operation equivalence|payment/i);
  assert.match(html,/\/services\/offer\?sku=ni%3A%2F%2F%2Fsha-256%3B/);
  assert.match(html,/\/services\/compare.json\?sku=/);
  assert.doesNotMatch(html,/<script>|MUST_NOT_LEAK|PRIVATE_PAYEE|pay now|checkout form/i);
});

test("Shop delegates exactly one read to Market fixed comparison URL, without buyer keys",async()=>{
  const calls=[];
  const res=await response([a,b],{fetchSource:serve(original(),calls)});
  assert.equal(res.status,200);
  assert.equal(calls.length,1);
  const address=new URL(calls[0].address);
  assert.equal(address.origin+address.pathname,ORIGINAL_MARKET_COMPARISON_URL);
  assert.deepEqual(address.searchParams.getAll("sku"),[a,b]);
  assert.equal(calls[0].options.method,"GET");
  assert.equal(calls[0].options.credentials,"omit");
  assert.equal(calls[0].options.redirect,"manual");
  assert.equal(calls[0].options.headers.accept,"application/json");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[0].options.headers["PAYMENT-SIGNATURE"],undefined);
  assert.equal(res.headers.get("cache-control"),"no-store");
  assert.match(res.headers.get("content-security-policy"),/default-src 'none'/);
});

test("agent JSON and human HTML agree on exact identity and omitted source offers",async()=>{
  const reading=original([a,c,b]);
  for(const path of ["/services/compare","/services/compare.json"]){
    const resp=await serviceCompareResponse(new Request(url([a,c,b],path)),{
      fetchSource:serve(reading),
    });
    assert.equal(resp.status,200);
    if(path.endsWith(".json")){
      const json=await resp.json();
      assert.deepEqual(json.requestedSkus,[a,c,b]);
      assert.deepEqual(json.missingSkus,[c]);
      assert.deepEqual(json.offers.map(x=>x.sku),[a,b]);
      assert.equal(json.interpretation.includes("payment"),true);
      assert.equal(JSON.stringify(json).includes("PRIVATE_PAYEE"),false);
      assert.equal(resp.headers.get("access-control-allow-origin"),"*");
    } else {
      const html=await resp.text();
      assert.match(html,/Unlisted or missing original SKUs/);
      assert.ok(html.includes(c));
      assert.doesNotMatch(html,/PRIVATE_PAYEE/);
    }
  }
});

test("one or zero selected offers opens a source-free choice form, never payment",async()=>{
  for(const skus of [[],[a]]){
    let calls=0;
    const resp=await response(skus,{fetchSource:async()=>{calls++;throw Error("source consulted by picker")}});
    assert.equal(resp.status,200);
    assert.match(await resp.text(),/Choose two to eight original SKUs/);
    assert.equal(calls,0);
  }
  const agent=await serviceCompareResponse(new Request(url([a],"/services/compare.json")),{fetchSource:async()=>{throw Error("unexpected fetch")}});
  assert.equal(agent.status,400);
});

test("invalid, extra and ambiguous selection cannot contact the seller",async()=>{
  const cases=[
    "/services/compare?sku=bad&sku="+encodeURIComponent(b),
    "/services/compare?sku="+encodeURIComponent(a)+"&sku="+encodeURIComponent(a),
    "/services/compare?sku="+encodeURIComponent(a)+"&sku="+encodeURIComponent(b)+"&actor=admin",
    "/services/compare?"+Array.from({length:9},(_,i)=>"sku="+encodeURIComponent(String(i).repeat(43))).join("&"),
  ];
  for(const path of cases){
    let count=0;
    const resp=await serviceCompareResponse(new Request("https://shop.561.group"+path),{
      fetchSource:async()=>{count++;throw Error("invalid request sent upstream")},
    });
    assert.equal(resp.status,400,path);
    assert.equal(count,0);
  }
  const post=await serviceCompareResponse(new Request(url(),{method:"POST"}),{fetchSource:async()=>{throw Error("mutation")}});
  assert.equal(post.status,405);assert.equal(post.headers.get("allow"),"GET, HEAD");
});

test("GET and HEAD preserve human and agent response headers without payment challenge",async()=>{
  for(const path of ["/services/compare","/services/compare.json"]){
    const res=await serviceCompareResponse(new Request(url([a,b],path),{method:"HEAD"}),{
      fetchSource:serve(),
    });
    assert.equal(res.status,200);
    assert.equal(await res.text(),"");
    assert.equal(res.headers.get("payment-required"),null);
    assert.match(res.headers.get("content-type"),path.endsWith(".json")?/json/:/html/);
  }
});

test("seller outage, forgery and incomplete source are unavailable, never fabricated zero",async()=>{
  const corrupted=original();corrupted.requestedSkus=[a,d];
  const faulty=[
    async()=>Response.json(corrupted),
    async()=>new Response("<html>not JSON</html>",{headers:{"content-type":"text/html"}}),
    async()=>new Response("",{status:302,headers:{location:"https://other.example"}}),
    async()=>new Response("",{status:500}),
    async()=>{throw Error("Market unavailable")},
  ];
  for(const fetchSource of faulty){
    const res=await response([a,b],{fetchSource});
    assert.equal(res.status,503);
    assert.match((await res.json()).error,/unavailable/);
  }
});

test("Market source decoder caps streaming before buffering full untrusted comparison",async()=>{
  let cancelled=false;
  const tooLarge=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(4_000_001));},
    cancel(){cancelled=true;}
  }),{headers:{"content-type":"application/json"}});
  const result=await response([a,b],{fetchSource:async()=>tooLarge});
  assert.equal(result.status,503);
  assert.equal(cancelled,true);
});

test("bounded rendering omits oversized schema previews without inventing contracts",()=>{
  const source=original();
  source.offers[0].request={bodySchema:{type:"object",description:"x".repeat(9000)}};
  const reading=admitServiceComparison(source,[a,b]);
  const html=renderServiceComparisonHTML(reading);
  assert.match(html,/Source contract exceeds the bounded inline preview/);
  assert.equal(html.includes("x".repeat(9000)),false);
});

test("native Shop dispatcher composes comparison with original service routes, not book checkout",async()=>{
  let reads=0;
  const route=routeServiceDiscovery(new Request(url()),{
    fetchSource:async(u)=>{reads++;assert.ok(u.startsWith(ORIGINAL_MARKET_COMPARISON_URL));return Response.json(original())},
  });
  assert.ok(route);
  assert.equal((await route).status,200);
  assert.equal(reads,1);
  for(const path of ["/goods/the-x402-economy","/mcp","/webhooks/stripe","/support"]){
    assert.equal(routeServiceDiscovery(new Request("https://shop.561.group"+path),{
      fetchSource:async()=>{throw Error("must not route")},
    }),null);
  }
});

test("first-party offer detail provides a real two-SKU form to source comparator",()=>{
  const sku=a;
  const catalog={
    recordType:"561-group.x402-market-catalog",market:"https://market.561.group",
    settlement:{protocol:"x402"},offers:[{
      sku,name:"Exact offer",listed:true,method:"POST",
      url:"https://market.561.group/v1/test",price:"$0.04",
    }],
  };
  const offer=projectOriginalMarketServices(catalog).services[0];
  const html=renderServiceOfferPage({
    source:{market:"https://market.561.group"},
    offer,qualifications:{listing:"original",checkout:"original"},
  });
  assert.match(html,/action="\/services\/compare"/);
  assert.match(html,/type="hidden" name="sku" value="ni:\/\/\/sha-256;/);
  assert.match(html,/Compare original offers/);
});
