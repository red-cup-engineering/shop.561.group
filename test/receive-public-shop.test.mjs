import test from 'node:test';
import assert from 'node:assert/strict';
import { receivePublicShop } from '../scripts/receive-public-shop.mjs';

const ORIGIN = 'https://shop.561.group';
const campaign = {
  canonicalUrl: ORIGIN + '/support', merchantDisplayName: 'emsenn', campaignId: 'open-work-2026-10',
  channels: [{id: 'github', medium: 'referral'}, {id: 'fediverse', medium: 'social'}, {id: 'email', medium: 'email'}],
  oneTime: {links: {direct: {id: 'plink_direct', url: 'https://buy.stripe.com/3cIfZi9HA2Smgni3Io5EY03'},
    github: {id: 'plink_github', url: 'https://buy.stripe.com/9B68wQ9HA50ub2Yen25EY04'},
    fediverse: {id: 'plink_fediverse', url: 'https://buy.stripe.com/cNi8wQg5Y8cG8UQ2Ek5EY05'}}},
  monthly: {url: 'https://buy.stripe.com/28E28s1b4gJcb2Y3Io5EY02'},
};
const catalog = {merchant: {name: '561 Group', legalBody: 'emsenn'},
  offerings: [
    {id: 'the-x402-economy', status: 'live', priceCents: 900, currency: 'usd',
      release: 'the-x402-economy', agentOfferUrl: 'https://bazaar.561.group/offers?id=original'},
    {id: 'something-else', status: 'coming-soon', priceCents: 1200, currency: 'usd'},
  ]};
const call = fetcher => receivePublicShop({fetcher, campaign, catalog});
const body = (value, type) => new Response(value, {status: 200, headers: {'content-type': type}});
const sharePack = () => ({
  campaignId: campaign.campaignId, landingUrl: campaign.canonicalUrl,
  items: campaign.channels.map(channel => {
    const url = new URL(campaign.canonicalUrl);
    url.searchParams.set('utm_source', channel.id);
    url.searchParams.set('utm_medium', channel.medium);
    url.searchParams.set('utm_campaign', campaign.campaignId);
    const link = campaign.oneTime.links[channel.id] ?? campaign.oneTime.links.direct;
    return {channel: channel.id, medium: channel.medium, shareUrl: url.toString(),
      paymentLinkId: link.id,
      paymentAttribution: campaign.oneTime.links[channel.id] ? 'channel-specific' : 'direct-fallback'};
  }),
});
const routing = (rewrite = () => undefined) => async (raw, init) => {
  const url = new URL(raw);
  const key = init.method + ' ' + url.pathname + url.search;
  const custom = rewrite(key, url, init);
  if (custom) return custom;
  if (key === 'GET /') return body('<a href="/support">561 Group</a>', 'text/html');
  if (key === 'GET /catalog.json') return Response.json(catalog);
  if (key === 'GET /support') return body('<div id="billing-support">emsenn <a href="/support/go?kind=one-time&amp;source=direct"></a><a href="/support/go?kind=monthly&amp;source=direct"></a></div>', 'text/html');
  if (key === 'HEAD /support') return new Response(null, {status:200, headers:{'content-type':'text/html'}});
  if (key === 'GET /support/share.json') return Response.json(sharePack());
  if (key === 'GET /sitemap.xml') return body('<loc>' + ORIGIN + '/support</loc>', 'application/xml');
  if ((key === 'HEAD /support/go?kind=one-time&source=direct' || key === 'GET /support/go?kind=one-time&source=direct')) return new Response(null, {status:303,
    headers:{location:campaign.oneTime.links.direct.url, 'cache-control':'no-store', 'referrer-policy':'no-referrer'}});
  if ((key === 'HEAD /support/go?kind=one-time&source=github' || key === 'GET /support/go?kind=one-time&source=github')) return new Response(null, {status:303,
    headers:{location:campaign.oneTime.links.github.url, 'cache-control':'no-store', 'referrer-policy':'no-referrer'}});
  if ((key === 'HEAD /support/go?kind=one-time&source=fediverse' || key === 'GET /support/go?kind=one-time&source=fediverse')) return new Response(null, {status:303,
    headers:{location:campaign.oneTime.links.fediverse.url, 'cache-control':'no-store', 'referrer-policy':'no-referrer'}});
  if ((key === 'HEAD /support/go?kind=monthly&source=direct' || key === 'GET /support/go?kind=monthly&source=direct')) return new Response(null, {status:303,
    headers:{location:campaign.monthly.url, 'cache-control':'no-store', 'referrer-policy':'no-referrer'}});
  if (key === 'POST /support') return new Response(null, {status:405, headers:{allow:'GET, HEAD'}});
  if (key === 'GET /support/go?kind=invalid') return new Response('Offer not found', {status:404});
  return new Response('unexpected request', {status:404});
};

test('positive public buyer route, legal seller, and no implicit payments or redirects', async () => {
  const inputs = [];
  const report = await call(async (url, options) => {
    inputs.push({url, options});
    return routing()(url, options);
  });
  assert.equal(report.kind, 'shop.public-unsigned-buyer-receiving/v1');
  assert.equal(report.acceptedPublicRoutes, true);
  assert.equal(report.cases.length, 16);
  assert.equal(report.cases.every(c => c.finding === 'received'), true);
  assert.equal(report.merchant, 'emsenn');
  assert.equal(report.installedSourceVersion, null);
  assert.equal(report.signedPayment, 'not-attempted');
  assert.equal(report.customerDelivery, 'not-observed');
  assert.equal(report.netSettledCash, 'not-observed');
  assert.equal(inputs.length, 16);
  assert.equal(inputs.every(c => c.url.startsWith(ORIGIN) &&
    c.options.redirect === 'manual' && c.options.credentials === 'omit' &&
    c.options.cache === 'no-store'), true);
  assert.equal(inputs.filter(c => c.options.method === 'POST').length, 1);
  assert.equal(inputs.find(c => c.options.method === 'POST').url, ORIGIN + '/support');
});

test('live 404 is an explicit nonaccepted buyer surface, not a source-success claim', async () => {
  const report = await call(routing((key) => key === 'GET /support' ?
    new Response('Not Found', {status:404}) : undefined));
  assert.equal(report.acceptedPublicRoutes, false);
  assert.deepEqual(report.cases.filter(c => c.finding !== 'received').map(c => [c.case,c.status,c.finding]),
    [['support',404,'unexpected-http-status']]);
});

test('foreign-merchant redirects and broken privacy controls fail without following payment URLs', async () => {
  const called = [];
  const report = await call(async (url, opts) => {
    called.push(url);
    return routing((key) => key === 'HEAD /support/go?kind=one-time&source=direct' ?
      new Response(null, {status:303, headers:{location:'https://buy.stripe.com/WRONG',
        'cache-control':'no-store', 'referrer-policy':'no-referrer'}}) :
      key === 'POST /support' ? new Response(null, {status:200}) : undefined)(url, opts);
  });
  assert.equal(report.acceptedPublicRoutes, false);
  assert.equal(report.cases.find(c => c.case === 'tip-redirect').finding, 'unqualified-merchant-redirect');
  assert.equal(report.cases.find(c => c.case === 'refuse-unsupported-method').finding, 'unexpected-http-status');
  assert.equal(called.every(url => url.startsWith(ORIGIN)), true);
});

test('a HEAD-only redirect cannot falsely accept a broken human GET buyer click', async () => {
  const report = await call(routing(key =>
    key === 'GET /support/go?kind=one-time&source=direct' ?
      new Response('missing actual buyer route', {status:404}) : undefined));
  assert.equal(report.cases.find(c => c.case === 'tip-redirect').finding, 'received');
  assert.equal(report.cases.find(c => c.case === 'tip-buyer-click').finding, 'unexpected-http-status');
  assert.equal(report.acceptedPublicRoutes, false);
});

test('a GET-only wrong-payee redirect refuses despite matching HEAD preflight', async () => {
  const report = await call(routing(key =>
    key === 'GET /support/go?kind=monthly&source=direct' ?
      new Response(null, {status:303, headers:{
        location:'https://buy.stripe.com/WRONGPAYEE',
        'cache-control':'no-store', 'referrer-policy':'no-referrer'
      }}) : undefined));
  assert.equal(report.cases.find(c => c.case === 'monthly-redirect').finding, 'received');
  assert.equal(report.cases.find(c => c.case === 'monthly-buyer-click').finding, 'unqualified-merchant-redirect');
  assert.equal(report.acceptedPublicRoutes, false);
});

test('wrong legal seller and missing original products refuse as incomplete commerce', async () => {
  const report = await call(routing(key => key === 'GET /catalog.json' ?
    Response.json({merchant: {name:'561 Group',legalBody:'unformed-llc'}, offerings:[{id:'invented'}]}) : undefined));
  assert.equal(report.cases.find(c => c.case === 'catalog').finding, 'original-source-consumer-mismatch');
  assert.equal(report.acceptedPublicRoutes, false);
});

test('price and rail drift cannot pass merely by keeping seller and SKU identifiers', async () => {
  const changes = [
    item => {item.status = 'coming-soon';},
    item => {item.priceCents = 1;},
    item => {item.currency = 'eur';},
    item => {item.release = 'older-unaccepted-edition';},
    item => {item.agentOfferUrl = 'https://example.invalid/checkout';},
  ];
  for (const corrupt of changes) {
    const changed = structuredClone(catalog);
    corrupt(changed.offerings[0]);
    const report = await call(routing(key => key === 'GET /catalog.json' ?
      Response.json(changed) : undefined));
    assert.equal(report.acceptedPublicRoutes, false);
    assert.equal(report.cases.find(c => c.case === 'catalog').finding,
      'original-source-consumer-mismatch');
  }
});

test('oversized body, bad content type, and denied transport return finite, private failures', async () => {
  const report = await call(routing(key => {
    if (key === 'GET /support') return new Response('private-buyer@example.invalid', {
      headers:{'content-type':'text/html','content-length':'9999999'}});
    if (key === 'GET /support/share.json') return new Response('{}', {headers:{'content-type':'text/html'}});
    return undefined;
  }));
  assert.equal(report.acceptedPublicRoutes, false);
  assert.equal(report.cases.find(c => c.case === 'support').finding, 'transport-or-bounded-body-refused');
  assert.equal(report.cases.find(c => c.case === 'share').finding, 'unexpected-content-type');
  assert.equal(JSON.stringify(report).includes('private-buyer@example.invalid'), false);
  const failed = await call(async () => {throw new Error('PRIVATE TOKEN - do not print');});
  assert.equal(failed.acceptedPublicRoutes, false);
  assert.equal(failed.cases.every(c => c.finding === 'transport-or-bounded-body-refused'), true);
  assert.equal(JSON.stringify(failed).includes('PRIVATE TOKEN'), false);
});

test('reject forged campaign attribution, repeated channels and changed rail assignments', async () => {
  const corruptions = [
    pack => { pack.items[1] = {...pack.items[0]}; },
    pack => { pack.items[0].shareUrl = ORIGIN + '/support?utm_source=unknown'; },
    pack => { pack.items[0].paymentLinkId = 'plink_foreign'; },
    pack => { pack.items[1].paymentAttribution = 'direct-fallback'; },
    pack => { pack.items[2].medium = 'social'; },
    pack => { pack.landingUrl = 'https://example.invalid/support'; },
  ];
  for (const corrupt of corruptions) {
    const pack = sharePack();
    corrupt(pack);
    const report = await call(routing(key => key === 'GET /support/share.json' ?
      Response.json(pack) : undefined));
    assert.equal(report.acceptedPublicRoutes, false);
    assert.equal(report.cases.find(c => c.case === 'share').finding,
      'original-source-consumer-mismatch');
  }
});

test('missing, duplicate, foreign and unsafe source payment URLs refuse before buyer network calls', async () => {
  const corruptions = [
    campaign => { campaign.monthly.url = ''; },
    campaign => { campaign.oneTime.links.direct.url = ''; },
    campaign => { campaign.monthly.url = campaign.oneTime.links.direct.url; },
    campaign => { campaign.oneTime.links.github.url = 'http://buy.stripe.com/9B68wQ9HA50ub2Yen25EY04'; },
    campaign => { campaign.oneTime.links.fediverse.url = 'https://foreign.example/checkout'; },
    campaign => { campaign.oneTime.links.direct.url = 'https://buy.stripe.com/'; },
    campaign => { campaign.monthly.url = 'https://buy.stripe.com@foreign.example/checkout'; },
    campaign => { campaign.oneTime.links.github.url += '?redirect=foreign'; },
  ];
  let reads = 0;
  const fetcher = async () => { reads++; throw new Error('network must not be consulted'); };
  for (const corrupt of corruptions) {
    const changed = structuredClone(campaign);
    corrupt(changed);
    await assert.rejects(() => receivePublicShop({fetcher, campaign:changed, catalog}),
      /Unique original HTTPS Stripe-hosted destinations required/);
  }
  assert.equal(reads, 0);
});

test('original seller/source and fixed HTTPS origin validate before any network call', async () => {
  let reads = 0;
  const fetcher = async () => {reads++; throw new Error('should not fetch');};
  await assert.rejects(() => receivePublicShop({fetcher, campaign, catalog,
    origin:'https://example.net'}), TypeError);
  await assert.rejects(() => receivePublicShop({fetcher, campaign: {...campaign,merchantDisplayName:'561 Group LLC'}, catalog}), TypeError);
  await assert.rejects(() => receivePublicShop({fetcher, campaign,
    catalog:{...catalog,merchant:{...catalog.merchant, legalBody:'561 Group LLC'}}}), TypeError);
  await assert.rejects(() => receivePublicShop({fetcher, campaign,catalog,timeoutMs:60000}), TypeError);
  assert.equal(reads, 0);
});
