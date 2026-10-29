import assert from "node:assert/strict";
import test from "node:test";
import { fulfillPromotionalSend, grantReference, shopGiftAdapters } from "../src/promotion-email-gifts.mjs";
const receipt = { accepted: true, status: "sent", provider: "fastmail", messageId: "m-21", to: ["reader@example.org"] };
const good = { offering: "ice-out", recipient: "reader@example.org", receipt };
const giftId = "gift-12345678-1234-1234-1234-123456789abc";
const giftUrl = "https://shop.561.group/gifts/gift-12345678-1234-1234-1234-123456789abc";
test("drafts, failures, and recipient substitution grant nothing", async () => {
  let calls = 0;
  const shopGrant = async () => { calls++; return { id: "id1" }; };
  const shopRead = async () => ({ offering: "ice-out", email: "reader@example.org" });
  for (const patch of [{ status: "draft" }, { accepted: false }, { failed: true }, { to: ["other@example.org"] }, { to: ["reader@example.org", "cc@example.org"] }]) {
    await assert.rejects(fulfillPromotionalSend({ ...good, receipt: { ...receipt, ...patch }, shopGrant, shopRead }));
  }
  assert.equal(calls, 0);
});
test("accepted send grants once by stable reference and receives exact reader", async () => {
  const calls = [];
  const shopGrant = async (payload) => { calls.push(payload); return { id: giftId, offering: "ice-out", url: giftUrl, disposition: "granted" }; };
  const shopRead = async () => ({ id: giftId, offering: "ice-out", status: "active" });
  const first = await fulfillPromotionalSend({ ...good, shopGrant, shopRead });
  const second = await fulfillPromotionalSend({ ...good, shopGrant, shopRead });
  assert.equal(first.reference, second.reference);
  assert.equal(calls[0].reference, calls[1].reference);
  assert.equal(first.verified, true);
  assert.equal(first.url, giftUrl);
  assert.notEqual(grantReference({ ...good, provider: "fastmail", messageId: "m-22" }), first.reference);
});
test("original PII-free Shop GET qualifies ID, offering and active status", async () => {
  const shopGrant = async () => ({ id: giftId, offering: "ice-out", url: giftUrl, disposition: "granted" });
  const actual = await fulfillPromotionalSend({ ...good, shopGrant, shopRead: async () =>
    ({ id: giftId, offering: "ice-out", status: "active", createdAt: "2026-10-24T00:00:00Z", revokedAt: null }) });
  assert.equal(actual.verified, true);
  for (const bad of [
    { id: "gift-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", offering: "ice-out", status: "active" },
    { id: giftId, offering: "wrong", status: "active" },
    { id: giftId, offering: "ice-out", status: "revoked" },
    { id: giftId, offering: "ice-out" },
    { id: giftId, offering: "ice-out", status: "active", email: "other@example.org" },
  ]) {
    await assert.rejects(fulfillPromotionalSend({ ...good, shopGrant, shopRead: async () => bad }), /gift readback/u);
  }
});
test("a forged Shop grant cannot be accepted or sent as a gift", async () => {
  for (const bad of [
    { id: giftId, offering: "wrong", url: giftUrl },
    { id: giftId, offering: "ice-out", url: "https://other.invalid/gifts/" + giftId },
    { id: "not-an-original-gift-id", offering: "ice-out", url: giftUrl },
    { id: giftId, offering: "ice-out" },
  ]) {
    await assert.rejects(fulfillPromotionalSend({ ...good,
      shopGrant: async () => bad,
      shopRead: async () => ({ id: giftId, offering: "ice-out", status: "active" }) }), /grant identity/u);
  }
});
test("shop API uses authenticated calls, never browser parameters", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ path: url.pathname, init }); return { ok: true, json: async () => url.pathname === "/api/gifts" ? { id: giftId, offering: "ice-out", url: giftUrl, disposition: "granted" } : { id: giftId, offering: "ice-out", status: "active" } }; };
  const adapters = shopGiftAdapters({ key: "secret", fetchImpl });
  await fulfillPromotionalSend({ ...good, ...adapters });
  assert.deepEqual(seen.map(x => x.path), ["/api/gifts", `/api/gifts/${giftId}`]);
  assert.ok(seen.every(x => x.init.headers.authorization === "Bearer secret"));
  assert.equal(JSON.parse(seen[0].init.body).email, "reader@example.org");
});
