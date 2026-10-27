import { validateCatalog } from "@red-cup-engineering/digital-goods-storefront-services-section";
import * as storefrontRuntime from "@red-cup-engineering/digital-goods-storefront-services-section/worker-runtime";
import { externalStripePaymentLinkIds } from "./external-stripe-payment-link-receiving.mjs";
const {createDigitalGoodsStorefrontWorker}=storefrontRuntime;
import catalog from "./compiled-catalog.mjs";
import { createShopFulfillmentBindings } from "./fulfillment.mjs";
import { marketCatalogTransport, serviceBrowseResponse, serviceOfferResponse } from "./service-discovery.mjs";
import { supportResponse } from "./support-campaign.mjs";
import { bookAtomFeed } from "./book-feed.mjs";

export const CATALOG = catalog;
export const CATALOG_VALIDATION = validateCatalog(catalog);
export const ORIGINAL_EXTERNAL_STRIPE_PAYMENT_LINK_IDS=externalStripePaymentLinkIds(catalog);
export const EXTERNAL_STRIPE_PAYMENT_LINK_RECEIVER_INSTALLED=
 storefrontRuntime.SUPPORTS_EXTERNAL_STRIPE_PAYMENT_LINK_AUDIT===true;

const runtime = createDigitalGoodsStorefrontWorker({
  catalog,
  origin: "https://shop.561.group",
  buyerActor: "urn:ame:shop-561-group-buyer",
  storefront: {
    title: "561 Group Books and Services",
    description: "Books, data, analysis and software services from the 561 Group. Find a service by task or owning service section.",
    footerHtml: "561 Group. <a href=\"https://market.561.group\">Market</a> · <a href=\"https://bazaar.561.group\">Bazaar</a> · <a href=\"https://shop.561.group\">Shop</a> · <a href=\"/services\">Services</a> · <a href=\"/support\">Support open work</a> · <a href=\"/books.atom\">Book updates (Atom)</a>. Browse books and services, and explore service details in the Bazaar. Agents: <a href=\"/services.json\">Service catalog JSON (GET)</a>, <a href=\"/catalog.json\">Shop catalog JSON (GET)</a>, <a href=\"/mcp\">Shop MCP (POST)</a> for list_products, search_products and get_product, <a href=\"https://bazaar.561.group/discovery.json\">Bazaar discovery JSON (GET)</a>, <a href=\"https://market.561.group/markets/discovery.json\">Market discovery JSON (GET)</a>. Discovery documents identify the existing Bazaar and Market MCP POST endpoints.",
  },
});

// Crawler documents are the catalog's own view: the storefront and one page per offering.
const ORIGIN = "https://shop.561.group";
function sitemap() {
  const paths = ["/", "/services", "/support", ...catalog.offerings.map((offering) => `/goods/${offering.id}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${ORIGIN}${path}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /oauth/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (request.method === "GET" && pathname === "/sitemap.xml") return new Response(sitemap(), { headers: { "content-type": "application/xml; charset=utf-8" } });
    if (["/support", "/support/", "/support/go", "/support/share.json"].includes(pathname)) return supportResponse(request);
    if (pathname === "/books.atom") {
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      const feed = bookAtomFeed(catalog);
      if (feed === null) return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
      return new Response(request.method === "HEAD" ? null : feed, {
        headers: {
          "content-type": "application/atom+xml; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (pathname === "/services/offer" || pathname === "/services/offer.json") {
      return serviceOfferResponse(request, { fetchSource: marketCatalogTransport(env.MARKET_SERVICE_CATALOG_FETCH, fetch) });
    }
    if (pathname === "/services" || pathname === "/services.json") {
      return serviceBrowseResponse(request, { fetchSource: marketCatalogTransport(env.MARKET_SERVICE_CATALOG_FETCH, fetch) });
    }
    return runtime.fetch(request, {
      ...env,
      ...createShopFulfillmentBindings(env.SHOP_FULFILLMENT),
      goods: env.SHOP_GOODS,
      tokenSecret: env.SHOP_TOKEN_SECRET,
      // Source-qualified emsenn merchant event observations are distinct from
      // this Shop's book checkout and entitlement custody. Older installed
      // suppliers must NOT receive an unimplemented capability assertion.
      externalPaymentLinks:EXTERNAL_STRIPE_PAYMENT_LINK_RECEIVER_INSTALLED
       ?ORIGINAL_EXTERNAL_STRIPE_PAYMENT_LINK_IDS:[],
      // Google sign-in opens when all three are set (wrangler secret put).
      accounts: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, sessionSecret: env.SHOP_SESSION_SECRET },
      // The comma-separated emails that may give books.
      gifters: String(env.SHOP_GIFTERS ?? "").split(",").map((email) => email.trim()).filter(Boolean),
      // The house's agents give books through /api/gifts with this key (pnpm arm-gift-agent); their gifts are Causeway's press office's.
      giftAgent: { key: env.SHOP_GIFT_AGENT_KEY, as: "press@561.group" },
    });
  },
};

export { ShopFulfillment } from "./fulfillment.mjs";

