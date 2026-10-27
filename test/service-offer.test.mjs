import assert from 'node:assert/strict';
import test from 'node:test';
import {renderServiceBrowse, projectOriginalMarketServices, renderServiceOfferPage, serviceOfferResponse} from '../src/service-discovery.mjs';

const a='ni:///sha-256;'+'A'.repeat(43);
const b='ni:///sha-256;'+'B'.repeat(43);
const hidden='ni:///sha-256;'+'H'.repeat(43);
const offer=(sku=a)=>({
  sku,name:'Site <script>oops</script> audit',listed:true,method:'POST',
  url:'https://market.561.group/v1/site-audit',category:'engineering',
  gateway:'typed-compute',operation:'audit',description:'Check & publish safely',
  seller:{enterprise:'Original Group seller',privateToken:'should-never-leak'},
  price:'$0.03',section:'services/web',
  request:{bodySchema:{type:'object',required:['site'],properties:{
    site:{type:'string',description:'Public URL & <secret>'},
    depth:{type:'integer',description:'Maximum pages'},
  }}},output:{schema:{type:'object',properties:{evidence:{type:'string'}}}},
  sourceRightsVerification:'not-declared',
  originalSecret:'not-an-export',
});
const source=offers=>({
  recordType:'561-group.x402-market-catalog',market:'https://market.561.group',
  settlement:{protocol:'x402'},offers,
});
const serve=(readout=source([offer()]),calls=[])=>async(url,options)=>{
  calls.push({url,options});
  return Response.json(readout);
};
const url=(sku=a,route='/services/offer')=>
  'https://shop.561.group'+route+'?'+new URLSearchParams({sku});
const get=(sku=a,options={})=>serviceOfferResponse(new Request(url(sku)),options);

test('directory carries source-exact first-party offer links and retains Bazaar',()=>{
  const html=renderServiceBrowse(projectOriginalMarketServices(source([offer()])));
  assert.match(html,/\/services\/offer\?sku=ni%3A%2F%2F%2Fsha-256%3B/);
  assert.match(html,/Original Bazaar listing/);
  assert.doesNotMatch(html,/<form[^>]+checkout|data-payment-signature/);
});

test('single-offer JSON preserves source identity and explicitly denies payment claims',async()=>{
  const response=await serviceOfferResponse(new Request(url(a,'/services/offer.json')),{fetchSource:serve()});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/application\/json/);
  const data=await response.json();
  assert.equal(data.recordType,'561-group.shop.original-service-detail.v1');
  assert.equal(data.offer.sku,a);
  assert.equal(data.offer.method,'POST');
  assert.equal(data.offer.endpoint,'https://market.561.group/v1/site-audit');
  assert.deepEqual(data.offer.input.bodySchema.required,['site']);
  assert.equal(data.offer.shopCheckoutAvailable,false);
  assert.equal(data.offer.externalPaidDeliveryVerified,false);
  assert.equal(data.sourceSearchCount,1);
  assert.equal(JSON.stringify(data).includes('should-never-leak'),false);
  assert.equal(JSON.stringify(data).includes('not-an-export'),false);
});

test('human detail renders semantic contract, accessible fields and correct buying boundary',async()=>{
  const response=await get(a,{fetchSource:serve()});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/<h1>Site &lt;script&gt;oops&lt;\/script&gt; audit<\/h1>/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/Check &amp; publish safely/);
  assert.match(html,/<th scope="row">site<\/th>/);
  assert.match(html,/Required<\/td>/);
  assert.match(html,/Public URL &amp; &lt;secret&gt;/);
  assert.match(html,/Structured output schema/);
  assert.match(html,/not a current payable quote/);
  assert.match(html,/Not available through this Shop detail page/);
  assert.match(html,/Inspect original Bazaar listing/);
  assert.match(html,/single-offer JSON readout/);
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
  for(const leak of ['should-never-leak','not-an-export','<script>oops</script>'])
    assert.equal(html.includes(leak),false);
  assert.doesNotMatch(html,/PAYMENT-SIGNATURE|Place order|Pay now/);
});

test('original seller receives exactly one bounded read with no payment or user credentials',async()=>{
  const calls=[];
  const response=await get(a,{fetchSource:serve(source([offer()]),calls)});
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  const original=new URL(calls[0].url);
  assert.equal(original.origin+original.pathname,'https://market.561.group/v1/catalog');
  assert.equal(original.searchParams.get('query'),a);
  assert.equal(original.searchParams.get('offset'),'0');
  assert.equal(original.searchParams.get('limit'),'50');
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.credentials,'omit');
  assert.equal(calls[0].options.redirect,'manual');
  assert.equal(calls[0].options.headers.accept,'application/json');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[0].options.headers['PAYMENT-SIGNATURE'],undefined);
});

test('HEAD stays side-effect-free and carries the selected representation headers',async()=>{
  for(const route of ['/services/offer','/services/offer.json']){
    const response=await serviceOfferResponse(new Request(url(a,route),{method:'HEAD'}),{fetchSource:serve()});
    assert.equal(response.status,200);
    assert.equal(await response.text(),'');
    assert.match(response.headers.get('content-type'),route.endsWith('json')?/json/:/html/);
  }
});

test('invalid, repeated and unknown query arguments refuse before reading Market',async()=>{
  const invalid=[
    '','?sku=bad','?sku='+encodeURIComponent(a)+'&sku='+encodeURIComponent(a),
    '?sku='+encodeURIComponent(a)+'&buyer=administrator','?q=hello',
  ];
  for(const query of invalid){
    const answer=await serviceOfferResponse(new Request('https://shop.561.group/services/offer'+query),{
      fetchSource:async()=>{throw Error('invalid input was sent upstream')},
    });
    assert.equal(answer.status,400,query);
  }
  const mutation=await serviceOfferResponse(new Request(url(),{method:'POST'}),{
    fetchSource:async()=>{throw Error('purchase attempted')},
  });
  assert.equal(mutation.status,405);
  assert.equal(mutation.headers.get('allow'),'GET, HEAD');
});

test('unlisted or absent exact identities never become a plausible listing',async()=>{
  const absent=await get(a,{fetchSource:serve(source([offer(b)]))});
  assert.equal(absent.status,404);
  const withdrawn=await get(hidden,{fetchSource:serve(source([{...offer(hidden),listed:false}]))});
  assert.equal(withdrawn.status,404);
});

test('source-provided pagination must be complete and exact to qualify detail',async()=>{
  const valid={...source([offer()]),total:1,offset:0,limit:50,nextOffset:null};
  assert.equal((await get(a,{fetchSource:serve(valid)})).status,200);
  for(const bad of [{total:2},{offset:1},{limit:25},{nextOffset:50}]){
    const response=await get(a,{fetchSource:serve({...valid,...bad})});
    assert.equal(response.status,503,JSON.stringify(bad));
  }
});

test('source window over 50 matching candidates cannot silently prove identity',async()=>{
  const many=Array.from({length:50},(_,i)=>
    offer('ni:///sha-256;'+String(i).padStart(43,'A')));
  const page={...source(many),total:51,offset:0,limit:50,nextOffset:50};
  assert.equal((await get(a,{fetchSource:serve(page)})).status,503);
});

test('failed, redirected or forged catalog responses fail closed, not as no inventory',async()=>{
  const malformed=[
    async()=>Response.json({bad:true}),
    async()=>new Response('',{status:302,headers:{location:'https://untrusted.example'}}),
    async()=>new Response('<html>no</html>',{headers:{'content-type':'text/html'}}),
    async()=>{throw Error('original seller unavailable')},
  ];
  for(const fetchSource of malformed){
    const response=await get(a,{fetchSource});
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/unavailable/i);
  }
});

test('large or absent schemas disclose their limits instead of creating fake fields',()=>{
  const base=projectOriginalMarketServices(source([offer()])).services[0];
  const reading={
    offer:{...base,input:{bodySchema:{type:'object',properties:{
      ...Object.fromEntries(Array.from({length:35},(_,i)=>['field'+i,{type:'string'}])),
    }}},output:null},
    source:{market:'https://market.561.group'},
    qualifications:{listing:'original',checkout:'unavailable'},
  };
  const html=renderServiceOfferPage(reading);
  assert.match(html,/Input fields \(first 24\)/);
  assert.doesNotMatch(html,/<th scope="row">field24<\/th>/);
  assert.match(html,/No structured contract supplied/);
  assert.doesNotMatch(html,/checkout-form|payment-token/);
});
