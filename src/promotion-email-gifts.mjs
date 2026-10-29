// Correlate an independently verified provider send acceptance to the shop's
// existing idempotent gift entitlement. No query-string/browser-triggered grants.
import { createHash } from "node:crypto";

function email(value) {
  if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim())) throw new Error("invalid recipient email");
  return value.trim().toLowerCase();
}
function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing ${name}`);
  return value.trim();
}
export function grantReference({ provider, messageId, offering, recipient }) {
  const parts = [required(provider, "provider"), required(messageId, "message id"), required(offering, "offering"), email(recipient)];
  return "press-email:" + createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/**
 * sendReceipt MUST be returned by an authenticated provider adapter, never from
 * a browser, link query parameter, client-supplied JSON, or a draft record.
 * shopGrant and shopRead are wrappers around /api/gifts and /api/gifts/:id.
 * The caller must persist failed accepted receipts for reconciliation.
 */
export async function fulfillPromotionalSend({ receipt, offering, recipient, shopGrant, shopRead }) {
  if (!receipt || receipt.accepted !== true || receipt.status !== "sent") throw new Error("mail transport has not accepted a sent message");
  if (receipt.draft === true || receipt.failed === true) throw new Error("draft or failed mail cannot grant");
  const to = email(recipient);
  const destinations = Array.isArray(receipt.to) ? receipt.to.map(email) : [];
  if (destinations.length !== 1 || destinations[0] !== to) throw new Error("sent recipient mismatch or ambiguous multi-recipient message");
  if (typeof shopGrant !== "function" || typeof shopRead !== "function") throw new Error("authenticated shop adapters required");
  const reference = grantReference({ provider: receipt.provider, messageId: receipt.messageId, offering, recipient: to });
  const grant = await shopGrant({ offering: required(offering, "offering"), email: to, reference });
  // Validate what the original authenticated Shop POST actually acknowledges,
  // including its original bearer link, before reading back the new grant.
  if (!grant || typeof grant.id !== "string"
      || !/^gift-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(grant.id)
      || grant.offering !== offering || grant.url !== `https://shop.561.group/gifts/${grant.id}`) {
    throw new Error("shop grant identity, offering or canonical URL mismatch");
  }
  const verified = await shopRead(grant.id);
  if (!verified || typeof verified !== "object") throw new Error("gift readback missing");
  const record = verified.gift ?? verified;
  // The real GET /api/gifts/:id deliberately omits the recipient email.
  // Recipient binding comes from the scoped, idempotent POST and the provider's
  // refusal to reassign its reference, not an invented email in a GET reply.
  // This is evidence of an active gift, never recipient access or delivery.
  if (record.id !== grant.id || record.offering !== offering || record.status !== "active"
      || (record.email !== undefined && email(record.email) !== to)) {
    throw new Error("shop gift readback identity or active state mismatch");
  }
  return { reference, id: grant.id, url: grant.url, disposition: grant.disposition, verified: true };
}

export function shopGiftAdapters({ origin = "https://shop.561.group", key, fetchImpl = fetch }) {
  if (!/^https:\/\//u.test(origin) || !required(key, "shop gift agent key")) throw new Error("HTTPS shop origin and gift key required");
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash) throw new Error("invalid shop origin");
  async function call(path, options = {}) {
    const response = await fetchImpl(new URL(path, url), { ...options, headers: { authorization: `Bearer ${key}`, ...(options.body ? { "content-type": "application/json" } : {}) } });
    if (!response.ok) throw new Error(`shop gift API returned HTTP ${response.status}`);
    return response.json();
  }
  return {
    shopGrant: (payload) => call("/api/gifts", { method: "POST", body: JSON.stringify(payload) }),
    shopRead: (id) => {
      if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("invalid gift id");
      return call(`/api/gifts/${id}`);
    },
  };
}
