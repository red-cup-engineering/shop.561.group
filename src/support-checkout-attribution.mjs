/** Source-qualified, privacy-minimized observation of imported Stripe Checkout
 * Sessions. This never fetches Stripe, accepts payment authority, contacts a
 * supporter, issues entitlements, or asserts Stripe/bank settlement.
 *
 * Consumer: scripts/reconcile-support-checkouts.mjs.
 * Original sources: Shop's live-support campaign + private Payment Link receiver
 * inventory. Stripe's standard Checkout Session list is the external input.
 */
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value, prefix) => typeof value === "string" && value.startsWith(prefix) && /^[A-Za-z0-9_]+$/u.test(value);
const knownInstant = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) && Number.isFinite(Date.parse(value));

function qualifiedLinks(campaign, receivers) {
 if (!isObject(campaign) || !isObject(campaign.oneTime) || !isObject(campaign.oneTime.links) ||
     !isObject(campaign.monthly) || !Array.isArray(receivers) ||
     typeof campaign.merchantDisplayName !== "string" || typeof campaign.campaignId !== "string")
  throw new TypeError("Original Shop campaign and private receiver source required");
 const result = [];
 const seen = new Set();
 let accountId = null;
 const configured = [
  ...Object.entries(campaign.oneTime.links).map(([channel, link]) => ({channel, kind: "one-time", link})),
  {channel: "monthly", kind: "recurring-start", link: campaign.monthly}
 ];
 for (const entry of configured) {
  const id = entry.link?.id;
  if (!validId(id, "plink_") || seen.has(id))
   throw new TypeError("Original campaign Payment Link identity missing or repeated");
  const qualified = receivers.filter(row => isObject(row) && row.type === "ExternalStripePaymentLinkReceiver" &&
   row.schemaVersion === 1 && row.stripePaymentLinkId === id &&
   row.merchantDisplayName === campaign.merchantDisplayName && validId(row.stripeMerchantAccountId, "acct_"));
  if (qualified.length !== 1 || (accountId !== null && qualified[0].stripeMerchantAccountId !== accountId))
   throw new TypeError("Campaign and independently recorded merchant account do not reconcile");
  accountId = qualified[0].stripeMerchantAccountId;
  seen.add(id);
  result.push({paymentLinkId: id, channel: entry.channel, kind: entry.kind});
 }
 return {accountId, links: result};
}

export function reconcileSupportCheckouts({campaign, receivers, observation}) {
 const source = qualifiedLinks(campaign, receivers);
 if (!isObject(observation) || observation.stripeContext !== source.accountId ||
     observation.livemode !== true || !knownInstant(observation.observedAt))
  throw new TypeError("Dated live-merchant Stripe observation with exact account identity required");
 const oneList = Object.hasOwn(observation, "checkoutSessions");
 const filteredLists = Object.hasOwn(observation, "checkoutSessionsByLink");
 if (oneList === filteredLists)
  throw new TypeError("Exactly one original Stripe list input mode required");
 const batches = [];
 if (oneList) batches.push({expectedLinkId: null, pages: observation.checkoutSessions});
 else {
  const entries = observation.checkoutSessionsByLink;
  if (!Array.isArray(entries) || entries.length !== source.links.length)
   throw new TypeError("One original filtered Stripe response required for each campaign Payment Link");
  const expected = new Set(source.links.map(link => link.paymentLinkId));
  const supplied = new Set();
  for (const entry of entries) {
   if (!isObject(entry) || !expected.has(entry.paymentLinkId) || supplied.has(entry.paymentLinkId))
    throw new TypeError("Filtered Stripe response has unknown, duplicated or missing Payment Link");
   supplied.add(entry.paymentLinkId);
   batches.push({expectedLinkId: entry.paymentLinkId, pages: entry.checkoutSessions});
  }
 }
 const links = source.links.map(link => ({...link, rowsObserved: 0, openUnpaid: 0,
  completedPaid: 0, completedNoPaymentRequired: 0, expired: 0, otherStatus: 0,
  observedCompletedPaidGrossCents: 0}));
 const byId = new Map(links.map(link => [link.paymentLinkId, link]));
 const seenSessions = new Set();
 let unattributedSessionRows = 0;
 let inputRowsObserved = 0;
 let anyUnreadPages = false;
 for (const {expectedLinkId, pages} of batches) {
  if (!isObject(pages) || pages.object !== "list" || !Array.isArray(pages.data) ||
      typeof pages.has_more !== "boolean" || pages.data.length > 100)
   throw new TypeError("Bounded original Stripe Checkout Session list response required");
  anyUnreadPages ||= pages.has_more;
  inputRowsObserved += pages.data.length;
  for (const session of pages.data) {
   if (!isObject(session) || !validId(session.id, "cs_live_") ||
       session.object !== "checkout.session" || session.livemode !== true ||
       !["open","complete","expired"].includes(session.status) ||
       !["paid","unpaid","no_payment_required"].includes(session.payment_status) ||
       (session.payment_link !== null && session.payment_link !== undefined &&
        !validId(session.payment_link, "plink_")) || seenSessions.has(session.id))
    throw new TypeError("Invalid, duplicate or mixed-mode Checkout Session");
   if (expectedLinkId !== null && session.payment_link !== expectedLinkId)
    throw new TypeError("Stripe payment_link-filtered response contains a different or missing Payment Link");
   seenSessions.add(session.id);
   const row = byId.get(session.payment_link);
   if (!row) {unattributedSessionRows++; continue;}
   row.rowsObserved++;
   if (session.status === "complete" && session.payment_status === "paid") {
    if (session.currency !== "usd" || !Number.isSafeInteger(session.amount_total) ||
        session.amount_total < 0 || !Number.isSafeInteger(row.observedCompletedPaidGrossCents + session.amount_total))
     throw new TypeError("Completed paid Checkout Session lacks qualified USD gross amount");
    row.completedPaid++;
    row.observedCompletedPaidGrossCents += session.amount_total;
   } else if (session.status === "open" && session.payment_status === "unpaid") row.openUnpaid++;
   else if (session.status === "complete" && session.payment_status === "no_payment_required")
    row.completedNoPaymentRequired++;
   else if (session.status === "expired") row.expired++;
   else row.otherStatus++;
  }
 }
 const inputCoverage = oneList
  ? (anyUnreadPages ? "additional-pages-unread" : "supplied-terminal-page-only")
  : (anyUnreadPages ? "source-selected-link-pages-unread" : "source-selected-terminal-link-pages");
 const inputQueryMode = oneList ? "single-caller-supplied-list" : "separate-caller-attested-payment-link-filtered-lists";
 const observedPaid = links.reduce((sum, link) => sum + link.completedPaid, 0);
 const observedGross = links.reduce((sum, link) => sum + link.observedCompletedPaidGrossCents, 0);
 if (!Number.isSafeInteger(observedGross)) throw new TypeError("Unsafe Checkout gross accumulator");
 return {
  type: "ShopStripeCheckoutAttributionObservation", schemaVersion: 1,
  sourceCampaignId: campaign.campaignId, sourceMerchant: campaign.merchantDisplayName,
  sourceStripeAccountId: source.accountId, observedAt: observation.observedAt,
  inputCoverage, inputQueryMode,
  inputRowsObserved, unattributedSessionRows,
  recognizedCompletedPaidCheckoutCount: observedPaid,
  recognizedCompletedPaidCheckoutGrossCents: observedGross,
  paymentLinks: links,
  sourceIsExternalStripeRead: "caller-attested-not-independently-authenticated-by-this-script",
  completedCheckoutIsNotBuyerAcceptedDelivery: true,
  recurringCheckoutIsNotAnActiveOrRenewedSubscription: true,
  stripeFeesCents: null, refundsCents: null, bankSettledNetCents: null,
  groupTreasuryReceivedNetCents: null, buyerAcceptedDeliveryCount: null
 };
}
