/**
 * Independent, unsigned public buyer-route receiving for the original Shop.
 * Checks installed HTTP against authored seller/support/catalog sources.
 * Never follows Checkout, reads customer data or claims settlement/delivery.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SHOP_ORIGIN = 'https://shop.561.group';
const MAX_BODY_BYTES = 262144;
const MAX_TIMEOUT_MS = 8000;
const must = (condition, reason) => { if (!condition) throw new TypeError(reason); };

async function boundedBody(response) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_BODY_BYTES))
    throw new TypeError('bounded-body-refused');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new TypeError('bounded-body-refused');
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    reader.releaseLock();
    if (total > MAX_BODY_BYTES) await response.body.cancel().catch(() => {});
  }
}

function cases(campaign, catalog) {
  const idSet = new Set(catalog.offerings.map(o => o.id));
  const originalOffers = new Map(catalog.offerings.map(o => [o.id, o]));
  // A correct merchant and SKU list is not enough: a stale installation can
  // silently change which items can be bought, for how much, or from which rail.
  // Compare only source-owned public commercial fields; private edition paths
  // and payment/provider records are deliberately not collected over HTTP.
  const saleFields = ['status', 'priceCents', 'currency', 'release', 'agentOfferUrl'];
  return [
    { id: 'home', method: 'GET', path: '/', status: 200, type: 'text/html',
      check: body => body.includes('/support') && body.includes(catalog.merchant.name) },
    { id: 'catalog', method: 'GET', path: '/catalog.json', status: 200, type: 'application/json',
      check: body => {
        const parsed = JSON.parse(body);
        return parsed?.merchant?.legalBody === catalog.merchant.legalBody &&
          parsed.merchant.name === catalog.merchant.name &&
          Array.isArray(parsed.offerings) && parsed.offerings.length === idSet.size &&
          parsed.offerings.every(item => {
            const original = originalOffers.get(item?.id);
            return original && saleFields.every(field => item[field] === original[field]);
          }) &&
          new Set(parsed.offerings.map(item => item.id)).size === idSet.size;
      } },
    { id: 'support', method: 'GET', path: '/support', status: 200, type: 'text/html',
      check: body => body.includes('id="billing-support"') &&
        body.includes('/support/go?kind=one-time&amp;source=direct') &&
        body.includes('/support/go?kind=monthly&amp;source=direct') &&
        body.includes(campaign.merchantDisplayName) },
    { id: 'support-head', method: 'HEAD', path: '/support', status: 200, type: 'text/html' },
    { id: 'share', method: 'GET', path: '/support/share.json', status: 200, type: 'application/json',
      check: body => {
        const parsed = JSON.parse(body);
        const channels = new Map(campaign.channels.map(channel => [channel.id, channel]));
        return parsed?.campaignId === campaign.campaignId &&
          parsed.landingUrl === campaign.canonicalUrl &&
          Array.isArray(parsed.items) && parsed.items.length === channels.size &&
          new Set(parsed.items.map(item => item?.channel)).size === channels.size &&
          parsed.items.every(item => {
            const channel = channels.get(item?.channel);
            const link = campaign.oneTime.links[item?.channel] ?? campaign.oneTime.links.direct;
            if (!channel || !link) return false;
            const expected = new URL(campaign.canonicalUrl);
            expected.searchParams.set('utm_source', channel.id);
            expected.searchParams.set('utm_medium', channel.medium);
            expected.searchParams.set('utm_campaign', campaign.campaignId);
            return item.medium === channel.medium &&
              item.shareUrl === expected.toString() &&
              item.paymentLinkId === link.id &&
              item.paymentAttribution ===
                (campaign.oneTime.links[item.channel] ? 'channel-specific' : 'direct-fallback');
          });
      } },
    { id: 'sitemap', method: 'GET', path: '/sitemap.xml', status: 200, type: 'application/xml',
      check: body => body.includes('<loc>' + SHOP_ORIGIN + '/support</loc>') },
    { id: 'tip-redirect', method: 'HEAD', path: '/support/go?kind=one-time&source=direct', status: 303,
      redirect: campaign.oneTime.links.direct.url },
    { id: 'github-tip-redirect', method: 'HEAD', path: '/support/go?kind=one-time&source=github', status: 303,
      redirect: campaign.oneTime.links.github.url },
    { id: 'fediverse-tip-redirect', method: 'HEAD', path: '/support/go?kind=one-time&source=fediverse', status: 303,
      redirect: campaign.oneTime.links.fediverse.url },
    { id: 'monthly-redirect', method: 'HEAD', path: '/support/go?kind=monthly&source=direct', status: 303,
      redirect: campaign.monthly.url },
    // Human browsers issue GET, not HEAD. Without these independent observations
    // an installed site can pass every redirect probe while every actual click
    // fails or sends the buyer to another recipient. Never follow the processor.
    { id: 'tip-buyer-click', method: 'GET', path: '/support/go?kind=one-time&source=direct', status: 303,
      redirect: campaign.oneTime.links.direct.url },
    { id: 'github-tip-buyer-click', method: 'GET', path: '/support/go?kind=one-time&source=github', status: 303,
      redirect: campaign.oneTime.links.github.url },
    { id: 'fediverse-tip-buyer-click', method: 'GET', path: '/support/go?kind=one-time&source=fediverse', status: 303,
      redirect: campaign.oneTime.links.fediverse.url },
    { id: 'monthly-buyer-click', method: 'GET', path: '/support/go?kind=monthly&source=direct', status: 303,
      redirect: campaign.monthly.url },
    { id: 'refuse-unsupported-method', method: 'POST', path: '/support', status: 405,
      allow: 'GET, HEAD' },
    { id: 'refuse-unknown-offer', method: 'GET', path: '/support/go?kind=invalid', status: 404 },
  ];
}

export async function receivePublicShop({ fetcher = fetch, campaign, catalog, origin = SHOP_ORIGIN, timeoutMs = 5000 } = {}) {
  must(origin === SHOP_ORIGIN, 'Only original Shop origin is admitted');
  must(Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= MAX_TIMEOUT_MS, 'Finite read timeout required');
  must(campaign?.canonicalUrl === SHOP_ORIGIN + '/support' && campaign?.merchantDisplayName === 'emsenn' &&
    typeof campaign?.campaignId === 'string' && Array.isArray(campaign?.channels) &&
    typeof campaign?.oneTime?.links?.direct?.url === 'string' &&
    typeof campaign?.oneTime?.links?.github?.url === 'string' &&
    typeof campaign?.oneTime?.links?.fediverse?.url === 'string' &&
    typeof campaign?.monthly?.url === 'string', 'Original campaign identity required');
  must(catalog?.merchant?.legalBody === 'emsenn' && typeof catalog?.merchant?.name === 'string' &&
    Array.isArray(catalog?.offerings) && catalog.offerings.length > 0 &&
    catalog.offerings.every(o => typeof o.id === 'string'), 'Original legal seller and compiled catalog required');
  // Source-side null/empty/malformed checkout URLs must never silently skip
  // the redirect comparison (a missing expected URL is otherwise falsy).
  // This is host/uniqueness qualification, NOT proof of the Stripe account.
  const hostedDestinations = [
    campaign.oneTime.links.direct.url,
    campaign.oneTime.links.github.url,
    campaign.oneTime.links.fediverse.url,
    campaign.monthly.url,
  ];
  must(hostedDestinations.every(url =>
    typeof url === 'string' && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/u.test(url)) &&
    new Set(hostedDestinations).size === hostedDestinations.length,
  'Unique original HTTPS Stripe-hosted destinations required');
  const observations = await Promise.all(cases(campaign, catalog).map(async spec => {
    const started = performance.now();
    let status = null;
    let finding = 'transport-unavailable';
    try {
      const response = await fetcher(origin + spec.path, {
        method: spec.method, redirect: 'manual', credentials: 'omit', cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      if (status !== spec.status) finding = 'unexpected-http-status';
      else if (spec.type && !response.headers.get('content-type')?.toLowerCase().startsWith(spec.type))
        finding = 'unexpected-content-type';
      else if (spec.redirect && (response.headers.get('location') !== spec.redirect ||
        !response.headers.get('cache-control')?.includes('no-store') ||
        response.headers.get('referrer-policy') !== 'no-referrer'))
        finding = 'unqualified-merchant-redirect';
      else if (spec.allow && response.headers.get('allow') !== spec.allow)
        finding = 'method-refusal-contract-mismatch';
      else if (spec.check && !(spec.check(await boundedBody(response))))
        finding = 'original-source-consumer-mismatch';
      else finding = 'received';
    } catch { finding = 'transport-or-bounded-body-refused'; }
    return { case: spec.id, status, finding, elapsedMs: Math.round(performance.now() - started) };
  }));
  return {
    kind: 'shop.public-unsigned-buyer-receiving/v1',
    origin, observedAt: new Date().toISOString(), merchant: catalog.merchant.legalBody,
    cases: observations, acceptedPublicRoutes: observations.every(o => o.finding === 'received'),
    installedSourceVersion: null, signedPayment: 'not-attempted', customerDelivery: 'not-observed',
    refundsAndFees: 'not-observed', netSettledCash: 'not-observed',
    limits: 'Unsigned public HTTP, source-selected expected seller/catalog; no checkout, entitlement, settlement, or proof of installed source version',
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const campaign = JSON.parse(await readFile(resolve(here, '../parameters/data/records/marketing/open-work-campaign.json'), 'utf8'));
  const catalog = (await import('../src/compiled-catalog.mjs')).default;
  const report = await receivePublicShop({ campaign, catalog });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.acceptedPublicRoutes) process.exitCode = 1;
}
