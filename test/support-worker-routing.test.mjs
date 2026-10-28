/** Source-only Cloudflare routing contract for the original Shop's dynamic
 * support buyer endpoints. Neither this test nor Wrangler dry-run establishes
 * which revision is installed on the actual custom domain.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
// This canonical Wrangler file uses standalone JSONC line comments only.
const config = JSON.parse(source.replace(/^\s*\/\/[^\r\n]*$/gmu, ""));

test("the original Shop support and source-qualified x402 buyer routes reach Worker before assets", () => {
  assert.equal(config.name, "shop-561-group");
  assert.equal(config.main, "src/worker.mjs");
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.routes, [{pattern: "shop.561.group", custom_domain: true}]);
  assert.equal(config.assets.directory, "./public");
  assert.deepEqual(config.assets.run_worker_first, ["/support", "/support/*", "/services/execute"]);
  const worker=readFileSync(new URL("../src/worker.mjs",import.meta.url),"utf8");
  assert.ok(worker.includes('pathname === "/services/execute"'));
  assert.ok(worker.includes("serviceMarketX402RelayResponse(request"));
  assert.ok(worker.includes("marketCatalogTransport(env?.MARKET_SERVICE_CATALOG_FETCH, fetch)"));
});

test("book covers and unrelated assets retain assets-first delivery", () => {
  assert.ok(Array.isArray(config.assets.run_worker_first));
  assert.equal(config.assets.run_worker_first.includes("/*"), false);
  assert.equal(config.assets.run_worker_first.includes("*"), false);
  assert.equal(config.assets.run_worker_first.includes("/goods/*"), false);
  assert.equal(config.assets.run_worker_first.includes("/books/*"), false);
});

test("direct Wrangler deploys require original source-qualified support and attribution guards", () => {
  const command = config.build?.command;
  assert.equal(typeof command, "string");
  // CI is not the only release entrance: the Shop's existing npm deploy
  // calls Wrangler directly, so the same bounded source gates must run there.
  for (const originalGuard of [
    "test/support-worker-routing.test.mjs",
    "test/support-public-probe.test.mjs",
    "test/support-checkout-attribution.test.mjs",
    "src/support-public-probe.mjs",
    "scripts/probe-public-support.mjs",
    "src/support-checkout-attribution.mjs",
    "scripts/reconcile-support-checkouts.mjs",
    "src/service-market-x402-relay.mjs",
    "test/service-market-x402-relay.test.mjs",
  ]) {
    assert.ok(command.includes(originalGuard), `missing direct deploy guard: ${originalGuard}`);
  }
  assert.ok(!command.includes("node scripts/probe-public-support.mjs"),
    "predeploy must syntax-check the public observer, not perform live network calls");
});
