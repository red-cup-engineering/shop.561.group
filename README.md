Received 2026-10-24 from causeway-services/shop.561.group@8612cc5179ca8e6dc1c8652dc17546a2cbd6c12d

# shop.561.group

<!-- 561-group-standards:badges:start -->
[![Causeway Services](https://img.shields.io/badge/561%20Group-Causeway%20Services-115e69)](https://github.com/causeway-services)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-115e69)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/causeway-services/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

**Intended product, from the Leader's October 18 requirement:** a sovereign,
human-and-agent **Shop** serving the Group's own offerings and reusable
storefront capabilities that another independently entitled enterprise can
purchase as a metered service. A Shop is a member of a Bazaar, which is a
member/observed arena of a Market: `Shop ∈ Bazaar ∈ Market` expresses typed,
source-attributed incidence, not a legal or protocol authority transfer.
Canonical Shop requirements and dated peer acceptance are in
[Public Services #17](https://github.com/causeway-services/public-services-section/issues/17);
the cross-enterprise requirement is
[Group market-bazaar-shop](https://github.com/561-group/561-group-services-section/blob/main/lib/agency/requirements/market-bazaar-shop-agentic-composable-enterprise.json).

## Destination and acceptance — not today's running implementation

- The Group's Shop offers first-party human-and-agent commerce: content/merch,
  rights-cleared digital/physical goods, services, APIs and signed entitlements
  where their original producers and commercial terms admit them. The existing
  book-shop features, release pointers, gifts and Stripe checkout remain valid
  supplier/consumer commitments.
- The actual upstream Computer Code/Web/TUFTE storefront supplier becomes a
  **sellable, pay-per-accepted-use** provider: any authorized Actor/Enterprise
  may rent its own branded Shop/catalog/page render, separately pay for
  checkout, delivery or other selected capability, and retain independent
  merchandise, books, payee, rights and portable data. An account may be both
  buyer and seller under different scoped rights. The Shop does not own global
  aggregation, original Bazaar ranking or Market statistics.
- Its discoverable shop identity, seller-authored contracts and lawful agent
  metadata may be indexed by bazaar.561.group alongside independently
  consenting outside Shops. Customers can find that Bazaar from market.561.group;
  neither host clones this Shop's payment keys or converts inclusion to agency.
- Future `shop.assist.561.group` consumes the ONE ASSIST engine to give chat
  and MCP access for browsing plus **grant-scoped** seller/manager operations;
  it is not provisioned just by this source requirement. Merchant account
  access, purchase/refund, spending and agent model usage have separate consent,
  authorizations, price units, revocation and idempotent receipts.
- Meet then beat **Shopify**, **WooCommerce**, **BigCommerce**, **Medusa** and
  creator Shop tasks of **Gumroad/Ko-fi/itch.io** on real comparable workloads:
  checkout and delivery, browsing, storefront authoring, storefront portability,
  agent tools, independent seller control, actual total cost per use and support.
  Etsy-wide cross-shop aggregation belongs to Bazaar; Shop can still meet the
  seller's Etsy experience. A source declaration or attractive UI does not beat
  an existing deployed storefront.

**Current source state, below:** this Worker is primarily a book/reader
storefront, not yet a federated multi-enterprise Shop or proven agentic
commerce service. Earlier product separation placed machine buyers on the
canonical `market.561.group` x402 merchant; changing that original paid URL,
release, entitlements or ledger requires independent receiving, not an abrupt
domain redirect. Historic shop design:
`engineering-services-section/content/text/documents/articles/notes/2026/09/27/2026-09-27-note-on-the-human-storefront.md`.

## Read-only product MCP supplied upstream (October 19, 2026)

The original Red Cup digital-goods storefront supplier [source commit ba156ab](https://github.com/red-cup-engineering/digital-goods-storefront-engineering-services-section/commit/ba156ab74edc8b964c599def88d317764614ba54), version `0.4.4-dev.1`, now serves `POST /mcp` through the **existing** MCP Networking transport. It exposes `list_products`, `search_products` and `get_product` over the **same** privacy-filtered `/catalog.json` readout and TUFTE text-matching producer. Results preserve the original merchant, URLs, prices, edition digests, release status and runtime `buyable` field. They never convey a payment authorization, customer account, purchase, order, refund, payout or settlement. Invalid cross-origin clients and unsafe requests are refused by the existing MCP transport; unknown SKUs are not invented.

`POST /mcp` can be called with normal MCP JSON-RPC: `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_product","arguments":{"id":"the-x402-economy"}}}`. To discover available tools, use `tools/list`; for filtering, `search_products` takes a bounded `query`, with optional `status`, `purchasableOnly`, `offset` and `limit`. The associated generic human storefront remains the same runtime. Distinct shops with separately accepted permissions remain in the original Coesite Bazaar, never hidden inside these tools.

**Receiving stage:** the supplier source and unit/integration tests are committed, and [Causeway's original consumer test](https://github.com/causeway-services/shop.561.group/commit/e0b5044f3585000997b5f9d867d696c0d9f315ec) now exercises its advertised shop product. The exact supplier version has not been independently published/selected in an installed Cloudflare Worker; these lines **do not assert** a deployed MCP endpoint or accepted external customer. The existing source-only `workspace:*` dependency must be resolved by original Code/Operations release machinery, with native test/Worker execution and real buyer HTTP readback before making a production availability claim.

## Qualifying the sovereign Storefront-as-a-Service and Shop (October 18, 2026)

**Product contract rather than a new marketplace implementation.** This hostname is **one shop** operated by 561 Group, not all shops or the operator of other enterprises' goods. The incumbent book catalog, Stripe Checkout, gifts, entitlement and edition/reader semantics stay operationally distinct. Its future human-and-agent offerings include rights-cleared digital goods, physical goods, subscriptions/memberships, tipped/pay-what-you-want goods, microservices, commissioned work and qualified bundled artifacts. A Shop can include multiple independent suppliers only under their own accepted seller/merchant-of-record, payout, fulfillment, revision and rights agreement; discovering *other Shops* is Bazaar's job.

**Storefronts are themselves sellable services.** One Computer Code/Web service Section is an independently accounted provider whose own Shop offers source-qualified storefront capabilities: tenant Shop provisioning, branded page rendering, catalog/API reads, accepted customization, checkout adapter, entitlements and optional maintenance. An Actor/Enterprise can be a paying consumer of this storefront provider while being the seller/operator of the goods in its rented Shop. They retain separate actor identity, domain, source catalog and product prices, rights, branding, grant delegation, bookkeeping/export and preferred allowed payment recipient. Neither an API call nor a code Section's provision of a page gives it ownership of the tenant's goods or the right to divert payment.

**End-to-end metered page example (requirement, not deployed):** Enterprise E with an authorized store-operation grant discovers a Storefront Page Render offer authored by Code Section C. E quotes and agrees to a bounded number or budget of *accepted delivered dynamic page renders* (or another explicitly declared unit). A customer visits E's Shop; an admitted render can consume C's capability and produce C→E usage/settlement evidence tied to a specific request, version, output and tariff. E separately sells its own product P directly to the authorized consumer, retaining P's offer, payment, delivery, royalty and refund obligations. If E chooses Bazaar listing, Market analytics or ASSIST management, those are **optional independent** services from possibly different actors with their own selected prices. A CDN cache hit, failure, suppressed bot abuse, replay, denied grant, ordinary free catalog page or unrelated consumer purchase cannot silently create another render charge. Tiny calls may settle from prepaid budgets/aggregated exact receipts when network fees exceed the microprice; no inferred zero-fee x402 economics.

**Bazaar hosting modes:** This Shop may remain on its original site while listed by Bazaar, or choose a separately contracted *full* tenant Shop hosting/page-render service under a Bazaar-managed route or its own domain. The provider of hosting and the Shop's selling enterprise keep separate identity, payment keys, customer promises and books; hosted does **not** mean Bazaar owns the Shop or that external sellers must migrate to our payment account. An outside Shop can leave the Bazaar and preserve the original purchased entitlements. No such tenant domain or hosting account is provisioned by these requirements.

**Human and agent parity.** A human can browse, inspect full delivery terms, buy, receive, access a library, seek support/refund and export data without needing an LLM. An authorized agent can perform the *same eligible jobs* through machine-readable catalog, typed checkout/purchase quote, order/status, entitlements and original MCP/A2A/HTTP capabilities. Chat or read-only MCP tools confer **no** seller, payment, refund or delegation authority. Shop grants are tenant- and action-scoped, expiring, revocable, audited at the native owner, and deny cross-tenant modification. Agent assistance and expensive rendering are add-ons, never a mandatory fee for free/direct use.

**Meet-then-beat controls — compare paired actual workflows, not brand breadth:**

| Incumbent / source | Exact Shop job to MEET before claiming BEAT | Distinct possible improvement to measure |
| --- | --- | --- |
| [Shopify online store](https://help.shopify.com/en/manual/online-store) | Responsive custom-domain shop, product search/filters, accelerated checkout and order experience | Lower *real* tenant cost for low traffic or pay-as-used merchants, with equally successful purchases |
| [WooCommerce REST + Store APIs](https://developer.woocommerce.com/docs/apis/) | Merchant product/order/customer operations separate from public cart/checkout/product APIs | Portable sovereign seller/agent capability and fewer mandatory hosting/extension components |
| [BigCommerce headless carts](https://docs.bigcommerce.com/developer/docs/admin/checkout-and-cart/custom-checkouts/graphql-storefront) | Cart, delivery/shipping, checkout, payment and original customer order | Metered storefront without surrendering tenant authority or checkout completeness |
| [Fourthwall creator shops](https://fourthwall.com/shops) | Creator-branded digital/physical products, fulfillment and membership | Source-portable goods and transparent independent service fees, preserving actual delivery quality |
| [Gumroad](https://gumroad.com/features) | Digital download editions, license keys, subscriptions, pay-what-you-want, export and analytics | Independently owned and deployable Shop, API/agent purchase parity and verifiable per-use economics |
| [Ko-fi Shop](https://help.ko-fi.com/hc/en-us/articles/360009712917-Ko-fi-Shop-Sell-digital-physical-products), [itch.io](https://itch.io/docs/general/about) | Low-friction creator product/patronage/commission, direct payment, pay-what-you-want, bundles and buyer delivery | Better autonomous-but-authorized merchant controls at comparable total buyer/seller cost |

**First valid/alternate/refusal receiving.** (A) Original 561 Shop retains a completed book purchase, reader library and gifts after provider separation; (B) an **actually entitled independent** shopkeeper buys one storefront render service from a real Section provider, publishes a distinct good and sells/delivers it without adopting the Group's legal body; (C) expired grants, stale tariffs, rights refusal, wrong payee, unpaid/suppressed renders, duplicate usage, cross-tenant edit and denied refund never become paid/fulfilled activity. Record elapsed time to publish, usable commerce jobs, true network/provider fees, independently accepted delivery and after-cost contribution, not predicted revenue. Until then all broader sovereignty/competitive clauses remain requirements, not an installed multi-tenant Shop.

**Reconciliation needed before implementation:** The operational catalog currently says agents buy the books through market.561.group and the current Worker is people/book-focused. Retain those real historical URLs, settlement, edition and recovery identifiers until a true migration is received; do **not** edit generated merchandise, reassign wallets or redirect customers as a shortcut. Destination cross-links: [Bazaar federation owner](https://github.com/coesite-operations/capability-market-services-section/issues/5), [Market-of-markets owner](https://github.com/causeway-services/market.561.group/issues/19), [ASSIST consumer](https://github.com/red-cup-engineering/assist/issues/2), [source-owned Group requirement](https://github.com/561-group/561-group-services-section/blob/main/lib/agency/requirements/market-bazaar-shop-agentic-composable-enterprise.json).

## What this is

A Cloudflare Worker (`src/worker.mjs`) that composes
`@red-cup-engineering/digital-goods-storefront-services-section`, which
owns everything below. This site owns its catalog, its branding, its
bindings and the `ShopFulfillment` Durable Object registration.

- The storefront, rendered by TUFTE: search, facets, book pages with
  covers, contents, formats and sizes, and each edition's verification
  record. Search engines and link previews get Open Graph and schema.org
  data.
- Card checkout through Stripe, and delivery of each book's paid release:
  the pointer at `goods/<release>/release.json` in `shop-561-group-goods`,
  the same one the market reads.
- Reader accounts through Google sign-in (any verified Google account; an
  account is its email).
- A library per reader. It always serves the newest accepted edition.
- Gifts. A gifter named in `SHOP_GIFTERS` gives a book to an email address
  from `/gifts` and gets a link to send. The link delivers the book at once,
  and the recipient keeps it by signing in with that address. A gift can be
  withdrawn.
- A gift API for the house's agents, with the gift-agent key; every such
  gift is recorded as given by `press@561.group`.
- Review copies. A review copy is not a gift of the retail release: it is
  the advance-reader rendition stamped for one reader, staged under its
  grant at `goods/<offering>/review-copies/<grant>/` in
  `shop-561-group-goods`. The publisher records it through
  `/api/review-copies` with the same key once it is staged. It can be given
  while a book is coming soon, its link states the review terms, it stops
  downloading when the reading window closes, and it can be withdrawn.

## Recurring product and Newswire access boundary

The selected storefront provides the host-only `runtime.readSubscriptionOrder(request, selection, env)` operation. It joins the original authenticated Google account, signed subscription event, immutable Checkout order and exact authored contract. It returns billing input and contract identity; it does not grant a permanent book download or create a data-delivery right. Stripe's `resolveSubscriptionAccess` separately observes current paid-period evidence. The Shop account and the fixed `urn:ame:shop-561-group-buyer` provider actor remain distinct identities.

The current selected `parameters/catalog.json` contains no recurring product with `mode: "subscription"`, `recurring`, `contractRef` and `contractRevision`. Its `health-education-newsletter` remains explicitly `coming-soon`; the outside-catalog monthly support link buys no books, services or exclusive rights. This supplier update therefore adds no recurring offer, subscription endpoint or entitlement store.

To connect an originally authored Newswire product, the original parameter owner must supply that immutable offering and its resource, query profiles, delivery channels and bounds. The trusted host must then supply the existing Paid Data `authenticateSubscriber` and `resolveSubscription` ports from the same authenticated account/order join, current Stripe billing evidence and the original product rights. Shop's `createShopFulfillmentBindings` supplies the **same** original `fulfillment.audit` object for both custody ports; an internal subscription consumer must preserve that identity. Newsletter and social delivery additionally require the original renderer and independent editorial verifier. The existing Paid Data [`NEWSWIRE-SUBSCRIPTION-ACCESS.md`](https://github.com/red-cup-engineering/paid-data-endpoint-service/blob/d97c3c75eb728a75074694c5db7036d8f2f11978/docs/NEWSWIRE-SUBSCRIPTION-ACCESS.md) owns that contract, including its final authority and source-rights rechecks. Neither an outside-catalog support payment nor notification consent supplies those rights.


## Private Stripe Checkout observation, not revenue recognition (October 23, 2026)

The existing `/support` campaign has four **outside-catalog** live emsenn Payment
Links. The original `scripts/export-support-campaign.mjs` produces the fixed
channel share/attribution pack; **new read-only** `npm run
marketing:reconcile -- <private-observation.json>` consumes a captured Stripe
`GET /v1/checkout/sessions` response without any API key. The private input
wrapper must contain exactly these fields:

```json
{
  "stripeContext": "acct_18eDiqJ1vYnPQu2N",
  "livemode": true,
  "observedAt": "2026-10-23T18:30:00Z",
  "checkoutSessions": {"object": "list", "data": [], "has_more": false}
}
```

Use the exact real GET response under `checkoutSessions`; an empty array in
this illustration is **not a provider observation**. Import only from the
authenticated matching Stripe merchant and maintain its access separately.
**Do not commit a real response:** it may contain customer personal information
or transaction references. The local consumer projects counts by the four
original source-pinned Payment Link IDs, rejects wrong-account/mixed-test data,
duplicate session IDs, malformed paid amounts and bad pagination shapes, and
never echoes customer fields. An unknown Payment Link is reported only as an
unattributed observed row. An open unpaid Checkout is not qualified buyer demand,
a completed paid Checkout is not accepted delivery, a recurring **first**
Checkout is not a renewed subscription, and provider gross is not revenue
cleared to the 561 Group.

`inputCoverage` is explicitly either `additional-pages-unread` or
`supplied-terminal-page-only`. Even a terminal page does not prove that the
caller supplied an unfiltered, exhaustive account history; the script itself
cannot authenticate the import. Fees, refunds, customer acceptance, actual
subscription invoices, bank deposits and **Group** after-cost contribution
remain `null` until independently source-received by the original provider,
merchant and Finance operations. No attribution result authorizes outreach,
Stripe mutation, book entitlement, deployment or a new contract. Native
regressions live in `test/support-checkout-attribution.test.mjs`; this is a
candidate **source** capability, not proof that `shop.561.group` is running
it or that any new merchant payment occurred.

For **four separately filtered Stripe Checkout list responses**, preserve the
actual provider pagination and do not fabricate a combined all-account list.
Pass `checkoutSessionsByLink` **instead of** `checkoutSessions` in the
same dated merchant observation wrapper. It is an array of four records,
each `{paymentLinkId, checkoutSessions}`, with the exact source-pinned
Payment Link ID and that ID's original
`GET /v1/checkout/sessions?payment_link=<id>` response. Every original
source link must occur exactly once, and each returned session must carry
the exact link queried. Wrong/missing links, mixed input modes, duplicate
sessions, malformed list envelopes, and invalid paid amounts refuse.
`inputQueryMode` distinguishes the input shape;
`source-selected-terminal-link-pages` means all **four supplied filtered
lists** said `has_more=false`, **not** that the caller proved exhaustive
account history. `source-selected-link-pages-unread` explicitly identifies
a still-paginated response. This privacy-minimal offline parser cannot
authenticate a caller's query URL or reclassify Stripe gross as delivered
customer value, personal bank clearance, or Group revenue.

Original commercial Work and acceptance remain
[Causeway Public Services #17](https://github.com/causeway-services/public-services-section/issues/17).
The live-data confirmation and Source→Install→Buyer→Finance separation are
independent receiving jobs.

## Receiving voluntary emsenn video-support checkouts into the original Shop economic audit

An externally hosted payment link is **not** a Shop book checkout. The live emsenn channel's source-owned `config.json` identifies an active $10 USD/month Stripe Payment Link operated by checkout merchant **emsenn** for a 561 Group public education purpose. The current Shop seller catalog still names 561 Group for its separate books. These merchant/program identities must not be collapsed into one legal beneficiary or a sale of books.

The existing `parameters/catalog.json` carries four private, typed `externalStripePaymentLinkReceivers[]` source records: the monthly support link pinned to the original emsenn channel `config.json` Git commit/blob, and the direct, GitHub and Fediverse one-time tip links pinned to the original Shop `data/records/marketing/open-work-campaign.json` Git commit/blob. Each record retains its exact original Payment Link ID, source-observed merchant and support program. **These are source-selected outside-catalog webhook receivers, NOT additional offerings.** The original `scripts/compile-catalog.mjs` carries the records unmodified into `src/compiled-catalog.mjs`; `src/external-stripe-payment-link-receiving.mjs` admits its exact field schema and returns only the verified IDs to the existing `src/worker.mjs` → Red Cup signed Stripe webhook. Industry JSON Schema Draft 2020-12 lives at `data/records/schema/external-stripe-payment-link-receiver.schema.json`. The Shop's public `/catalog.json`, buyer storefront and MCP product search continue exposing only original merchant/offering projections, **not** its internal webhook receiver inventory. The original 13 goods are unchanged.

The source selects `@red-cup-engineering/digital-goods-storefront-services-section@0.5.0` and `@red-cup-engineering/stripe-services-section@0.2.1`. The original storefront supplies `SUPPORTS_EXTERNAL_STRIPE_PAYMENT_LINK_AUDIT`, requires an explicit committed audit acknowledgement, and consumes the Stripe owner's complete native-event validator. Shop still enables the external ID list only when the installed original provider declares that capability. The `wrangler.jsonc` build guard checks the native original source/test and Worker routes. Source selection and native fixture receiving do not establish that the production Worker has been promoted or that a customer payment has been delivered.

The destination currently configured in the live Stripe account is `https://shop.561.group/webhooks/stripe` and subscribes to `checkout.session.completed` only. Its signed event can establish an observed Checkout completion and the actual provider payment status, but not the long-lived subscription history, invoice settlement, Stripe fees, payout, tax classification, legal ownership transfer or cleared Group treasury cash. Those require separately entitled Stripe subscription/invoice/balance and Group treasury receiving. Nothing in this source change purchases anything, registers a new webhook, edits customer accounts, spends on Notebook video generation or modifies public YouTube descriptions.

## The catalog

`parameters/catalog.json` (see Custody) lists the offerings. A book row names:

- its manuscript;
- its acceptance record, or the directory of its files for an edition
  older than acceptance records;
- the cover the ebook pipeline made.

A historical rendition without an `EbookEditionAcceptance` may be listed only
as `coming-soon`. Its surviving files make the work inspectable but do not
turn fabrication into editorial proof or an accepted edition. A cover is
optional until the publication is accepted.

`scripts/compile-catalog.mjs` reads those records into
`src/compiled-catalog.mjs`: title, series, contents, page count, file
sizes, SHA-256s, edition digest and the proof's counts. It also copies the
covers into `public/covers/` (untracked), which the Worker serves as
static assets. Edition state is untracked and is read from the main
worktree, so a deploy from a clean worktree compiles the same catalog.

## Routes

| Route | Behavior |
|---|---|
| `GET /` | The catalog, with search and facets. |
| `GET /goods/:id` | One book's page. |
| `POST /checkout/:id` | Starts a Stripe Checkout Session (same-origin only) and records the signed-in reader's account on it. |
| `POST /webhooks/stripe` | Verifies a Stripe signature and admits a paid, complete session as an entitlement. |
| `GET /thanks?session_id=` | Downloads for a purchase, and "keep it in your library". |
| `GET /library` | The signed-in reader's books. |
| `GET /gifts`, `POST /gifts` | The gifter's form and the gifts they have given. |
| `GET /gifts/:id` | A gift's link: the book, the note and the download. |
| `POST /gifts/:id/revoke` | Withdraws a gift. |
| `GET /api/gifts`, `POST /api/gifts` | Bearer `SHOP_GIFT_AGENT_KEY`. The giftable books; give one (`{offering, email, note?, reference?}` → `{id, url, disposition}`). A `reference` names the same gift every time, so a repeat never gives twice. |
| `GET /api/gifts/:id`, `POST /api/gifts/:id/revoke` | A gift the agent gave: its status; withdraw it. |
| `GET /review-copies/:id` | A review copy's link: the stamped copy, the review terms and the date it stops working. 410 once expired or withdrawn. |
| `POST /api/review-copies` | Bearer `SHOP_GIFT_AGENT_KEY`. Records a staged review copy (`{id, offering, email, release, artifactSha256, expiresAt, note?}` → `{id, url, disposition}`); 409 until the stamped copy under that grant names the same edition and bytes. |
| `GET /api/review-copies/:id`, `POST /api/review-copies/:id/revoke` | A review copy the agent recorded: its status and expiry; withdraw it. |
| `GET /oauth/login`, `/oauth/callback`, `/oauth/logout` | Google sign-in. |
| `GET /download/:token` | A signed, one-hour link to the entitlement's current release bytes. |
| `GET /catalog.json` | The compiled catalog. |

## Bindings and secrets

- Durable Object `SHOP_FULFILLMENT` / `ShopFulfillment`: checkouts,
  entitlements, accounts, gifts and review copies.
- R2 bucket `shop-561-group-goods` (`SHOP_GOODS`): release pointers and
  bundles, and each review copy's pointer and stamped EPUB.
- KV `SHOP_ENTITLEMENTS`: historical custody only. It grants nothing.
- Secrets:
  - `SHOP_TOKEN_SECRET`
  - `SHOP_SESSION_SECRET`
  - `SHOP_GIFTERS` (comma-separated emails)
  - `SHOP_GIFT_AGENT_KEY`: the gift API's key. `pnpm arm-gift-agent` makes
    it, keeps the node's copy at
    `~/.config/561-group/shop.561.group/gift-agent.key` (0600) and puts it
    into the Worker; nothing is printed.
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the Group's Google OAuth
    client, with `https://shop.561.group/oauth/callback` registered as a
    redirect URI.
- Card checkout's secrets: `STRIPE_SECRET_KEY` (a restricted key with only
  Checkout Sessions: Write), `STRIPE_WEBHOOK_SECRET` (the signing secret of
  the destination for `checkout.session.completed` at `/webhooks/stripe`) and
  `STRIPE_CUSTOMER_CONTRACT_TOKEN` (minted when the founder arms, accepting
  the customer-settlement contract). Until all three are set, each book says
  card checkout opens soon and offers x402. `pnpm arm-checkout` sets them:
  the founder signs in to Stripe in the node's assisted browser, creates the
  key and the destination there with the values its step panel shows, and
  pastes each secret into the panel. The script checks the key with Stripe
  and puts each secret into the Worker with `wrangler secret put`; nothing is
  printed or written to disk. It keeps secrets that are already set unless
  `--replace`, and `--test` arms with test-mode Stripe instead.

## Deploying

From a clean worktree of the commit:

```sh
pnpm --filter "@causeway-services/shop..." install --offline --frozen-lockfile
pnpm --filter "@causeway-services/shop..." run deploy
```

The normal Shop `deploy` script first compiles the original catalog, uses the existing Wrangler prebundle guards and deploys through the existing configured Worker. **It then runs `node scripts/receive-public-shop.mjs` against the public origin**, using the original campaign and compiled catalog as its independently selected expected sources. Twelve bounded, unsigned public cases receive the actual root, merchant catalog, support/billing page, static share and sitemap, fixed Stripe tip/monthly redirect identities (without following them), and required refusal statuses. DNS/TLS failures, 404s, wrong legal seller, wrong redirects, missing disclosure or invalid public responses make the command fail, with finite JSON findings and no customer data, charge or checkout session.

A deploy command's exit failure after Wrangler succeeds means the candidate **may be installed but was not publicly received**. Preserve source, original Cloudflare revision, rollback and incident evidence; do not infer successful consumer delivery or issue a blind repeat deploy. Inspect the source-owned Coesite release/rollback operator before changing the selected live version. This public receiving checks only what an unsigned buyer can inspect; it does not qualify an actual book purchase, signed webhook, active subscription, independently accepted entitlement, fees, refunds, payout or seller-level net cash. `npm run receive:public` repeats the same read-only buyer receiving without redeploying. The original full Worker dependency and materialized goods releases remain separately qualified.

## Testing

```sh
node --test test/*.test.mjs
```

## Source-owner x402 service browsing (October 21, 2026; candidate receiving)

The **original** Causeway x402 seller owns `https://market.561.group/v1/catalog`, not this book Shop or a recreated merchant registry. This Shop's proposed `GET/HEAD /services` human page and `GET/HEAD /services.json` machine reader **fetch that existing original public catalog** at request time (GET, redirect refused), verify its record type, market origin, x402 protocol, source SKU uniqueness and exact original seller URL, then project only `listed:true` services. A malformed/stale/unreachable source **fails closed with 503** rather than inventing an empty Shop inventory or creating a new static 131-row mirror. Both routes keep a bounded search/page size and no write or payment method.

The Shop service page is a browse-and-inspect entrance for one seller's offered APIs, separate from the unchanged 13 authored goods and their upstream Stripe/digital-goods checkout. Service prices are **original seller previews**, never an instant quote or live availability assertion: selecting an NI-backed service opens the existing Bazaar `https://bazaar.561.group/offers?source=house-x402&id=<encoded original SKU>` source-qualified detail. The current x402 quote and any authorized payment remain with the original Market seller; the Bazaar inspection link neither reissues the offer nor authorizes a purchase. The Shop does not obtain wallet authority, settle x402, issue entitlements or claim that a catalog declaration is externally buyable. Its original `/catalog.json`, `/mcp` tools and book route remain owned by the installed digital-goods storefront supplier. Bazaar continues federated third-party discovery; Shop reading one original seller is not Bazaar membership/custody.

**Source-only receiving and promotion:** `test/service-discovery.test.mjs` exercises the projection, pagination, masked status, absolute seller origin, duplicate identities, held/unlisted omission, current origin fetch, HEAD, human escaping, input bounds and failure cases without needing private checkout, wallet or external funds. Existing `test/worker.test.mjs` includes the original Worker route and unchanged book catalog contract. Native installed-suite run, real Cloudflare Worker deployment, public cross-host origin fetch, independent payer, settled transfer and delivered/accepted customer outcome are separate, not claimed by this change. The common governing acceptance criteria are owned by the Group requirement `market-bazaar-shop-agentic-composable-enterprise`, with practical follow-through under Public Services issue 17, Coesite Bazaar issue 5, and Causeway Market issue 4.

## Custody and parameters

This repository is Red Cup Engineering's deployable application for shop.561.group (transferred 2026-10-24 from `causeway-services`; history, redirects and public visibility preserved). The content the Shop publishes is data and lives in `causeway-services/public-shop-services-section`: `catalog.json`, `data/records/**` and `ops/*.md`. It is bound here as the `parameters/` git submodule, and `package.json` `imports` maps `#parameters/*` to `./parameters/*`, so the import path is the parameter: scripts read `parameters/catalog.json`, source and tests import `#parameters/...`, and the Worker bundle includes the bound records exactly as before.

- Clone with `git clone --recurse-submodules`, or run `git submodule update --init` (the section is private).
- To change the catalog, change `public-shop-services-section`, then advance the submodule pin here; `npm run compile` regenerates `src/compiled-catalog.mjs` from it.
- The `publication-source-preflight` workflow checks the submodule out with the `PARAMETERS_READ_TOKEN` secret (read-only on the section); without it CI cannot read the private section.
