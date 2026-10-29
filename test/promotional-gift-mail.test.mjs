import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { prepareJob, runJob, sendFastmail, deliverGiftNotice, confirmedGiftNotice } from "../scripts/promotional-gift-mail.mjs";
import { grantReference } from "../src/promotion-email-gifts.mjs";
const GIFT_ID = "gift-12345678-1234-1234-1234-123456789abc";
const GIFT_URL = "https://shop.561.group/gifts/gift-12345678-1234-1234-1234-123456789abc";

test("one accepted send grants and receipts, repeated run does not send twice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shop-promo-")); const file = join(dir, "job.json");
  await prepareJob(file, { from: "press@example.org", to: "reader@example.org", offering: "ice-out", subject: "An advance copy", body: "Here is the book." });
  let sends = 0, grants = 0;
  const send = async job => { sends++; return { accepted: true, status: "sent", provider: "fastmail-jmap", messageId: "sub123", to: [job.to] }; };
  const grant = { shopGrant: async () => { grants++; return { id: GIFT_ID, offering: "ice-out", url: GIFT_URL }; }, shopRead: async () => ({ id: GIFT_ID, offering: "ice-out", status: "active" }) };
  const old = process.env.SHOP_GIFT_AGENT_KEY, oldMail = process.env.FASTMAIL_JMAP_TOKEN;
  try {
    process.env.SHOP_GIFT_AGENT_KEY = "test"; process.env.FASTMAIL_JMAP_TOKEN = "test";
    assert.equal((await runJob(file, { send, grant })).state, "grant-verified");
    assert.equal((await runJob(file, { send, grant })).state, "grant-verified");
    assert.equal(sends, 1); assert.equal(grants, 1);
  } finally { if (old === undefined) delete process.env.SHOP_GIFT_AGENT_KEY; else process.env.SHOP_GIFT_AGENT_KEY = old; if (oldMail === undefined) delete process.env.FASTMAIL_JMAP_TOKEN; else process.env.FASTMAIL_JMAP_TOKEN = oldMail; }
});
test("send accepted then grant failure retries grant without another send", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shop-promo-")); const file = join(dir, "job.json");
  await prepareJob(file, { from: "press@example.org", to: "reader@example.org", offering: "ice-out", subject: "Book", body: "Read" });
  let sends = 0, grants = 0;
  const old = process.env.SHOP_GIFT_AGENT_KEY, oldMail = process.env.FASTMAIL_JMAP_TOKEN;
  try {
    process.env.SHOP_GIFT_AGENT_KEY = "test"; process.env.FASTMAIL_JMAP_TOKEN = "test";
    const send = async job => { sends++; return { accepted: true, status: "sent", provider: "fastmail-jmap", messageId: "submission2", to: [job.to] }; };
    const grant = { shopGrant: async () => { if (++grants === 1) throw new Error("network failed"); return { id: GIFT_ID, offering: "ice-out", url: GIFT_URL }; }, shopRead: async () => ({ id: GIFT_ID, offering: "ice-out", status: "active" }) };
    await assert.rejects(runJob(file, { send, grant }), /network failed/);
    assert.equal(JSON.parse(await readFile(file, "utf8")).state, "grant-failed");
    assert.equal((await runJob(file, { send, grant })).state, "grant-verified");
    assert.equal(sends, 1); assert.equal(grants, 2);
  } finally { if (old === undefined) delete process.env.SHOP_GIFT_AGENT_KEY; else process.env.SHOP_GIFT_AGENT_KEY = old; if (oldMail === undefined) delete process.env.FASTMAIL_JMAP_TOKEN; else process.env.FASTMAIL_JMAP_TOKEN = oldMail; }
});
test("uncertain send is never automatically repeated", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shop-promo-")); const file = join(dir, "job.json");
  await prepareJob(file, { from: "press@example.org", to: "reader@example.org", offering: "ice-out", subject: "Book", body: "Read" });
  const old = process.env.SHOP_GIFT_AGENT_KEY, oldMail = process.env.FASTMAIL_JMAP_TOKEN;
  try {
    process.env.SHOP_GIFT_AGENT_KEY = "test"; process.env.FASTMAIL_JMAP_TOKEN = "test";
    await assert.rejects(runJob(file, { send: async () => { throw new Error("unknown outcome"); }, grant: {} }), /unknown outcome/);
    await assert.rejects(runJob(file, { send: async () => { throw new Error("must not send"); }, grant: {} }), /uncertain/);
  } finally { if (old === undefined) delete process.env.SHOP_GIFT_AGENT_KEY; else process.env.SHOP_GIFT_AGENT_KEY = old; if (oldMail === undefined) delete process.env.FASTMAIL_JMAP_TOKEN; else process.env.FASTMAIL_JMAP_TOKEN = oldMail; }
});

test("Fastmail submission creates the email in the actual Drafts mailbox", async () => {
  const requests = [];
  const reply = data => ({ ok: true, json: async () => data });
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/session")) return reply({
      apiUrl: "https://jmap.fastmail.com/jmap/api/",
      primaryAccounts: {
        "urn:ietf:params:jmap:mail": "account1",
        "urn:ietf:params:jmap:submission": "account1",
      },
    });
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.methodCalls.some(([name]) => name === "Identity/get")) return reply({
      methodResponses: [
        ["Identity/get", { list: [{ id: "identity1", email: "press@example.org" }] }, "identities"],
        ["Mailbox/query", { ids: ["real-drafts-mailbox"] }, "drafts"],
      ],
    });
    const createdEmail = body.methodCalls.find(([name]) => name === "Email/set")[1].create.draft;
    if (createdEmail.mailboxIds?.["real-drafts-mailbox"] !== true)
      return reply({ methodResponses: [
        ["Email/set", { notCreated: { draft: { type: "invalidProperties", properties: ["mailboxIds"] } } }, "draft"],
        ["EmailSubmission/set", { notCreated: { submission: { type: "notFound" } } }, "submission"],
      ] });
    return reply({ methodResponses: [
      ["Email/set", { created: { draft: { id: "email1" } } }, "draft"],
      ["EmailSubmission/set", { created: { submission: { id: "submission1" } } }, "submission"],
    ] });
  };
  const receipt = await sendFastmail({
    from: "press@example.org", to: "reader@example.org", subject: "Your copy", body: "We are making a copy available.",
  }, "test-token", fetchImpl);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.messageId, "submission1");
  assert.deepEqual(receipt.to, ["reader@example.org"]);
  assert.equal(requests[0].methodCalls[1][0], "Mailbox/query");
  assert.equal(requests[1].methodCalls[0][1].create.draft.mailboxIds["real-drafts-mailbox"], true);
});

test("JMAP failed EmailSubmission cannot produce an accepted send receipt", async () => {
  const reply = data => ({ ok: true, json: async () => data });
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/session")) return reply({
      apiUrl: "https://jmap.fastmail.com/jmap/api/",
      primaryAccounts: {
        "urn:ietf:params:jmap:mail": "account1",
        "urn:ietf:params:jmap:submission": "account1",
      },
    });
    const { methodCalls } = JSON.parse(options.body);
    if (methodCalls[0][0] === "Identity/get") return reply({ methodResponses: [
      ["Identity/get", { list: [{ id: "identity1", email: "press@example.org" }] }, "identities"],
      ["Mailbox/query", { ids: ["drafts1"] }, "drafts"],
    ] });
    return reply({ methodResponses: [
      ["Email/set", { created: { draft: { id: "email1" } } }, "draft"],
      ["EmailSubmission/set", { notCreated: { submission: { type: "forbidden" } } }, "submission"],
    ] });
  };
  await assert.rejects(sendFastmail({
    from: "press@example.org", to: "reader@example.org", subject: "Book", body: "Read",
  }, "test-token", fetchImpl), /did not acknowledge submission/);
});

test("historical grant-readback records do not falsely claim reader receipt or resend", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shop-promo-")); const file = join(dir, "job.json");
  const record = await prepareJob(file, {
    from: "press@example.org", to: "reader@example.org", offering: "ice-out", subject: "Book", body: "Read",
  });
  await writeFile(file, JSON.stringify({ ...record, state: "received", gift: { id: "g1", verified: true } }));
  const outcome = await runJob(file, { send: async () => { throw new Error("should not resend"); } });
  assert.equal(outcome.state, "grant-verified");
  assert.equal(JSON.parse(await readFile(file, "utf8")).state, "grant-verified");
});

/** The original first send and its ID-bound shop grant are separately held.
 * No fake recipient receipt or real mail-provider access in these fixtures.
 */
async function noticeFixture() {
  const dir = await mkdtemp(join(tmpdir(), "shop-gift-notice-"));
  const file = join(dir, "job.json");
  const prepared = await prepareJob(file, {
    from: "press@example.org", to: "reader@example.org", offering: "ice-out",
    subject: "Book offer", body: "A gift link will follow after confirmation.",
  });
  const receipt = {
    accepted: true, status: "sent", provider: "fastmail-jmap",
    messageId: "original-submission", to: [prepared.to],
  };
  const id = GIFT_ID;
  const gift = {
    verified: true, id, url: `https://shop.561.group/gifts/${id}`,
    reference: grantReference({ provider: receipt.provider, messageId: receipt.messageId,
      offering: prepared.offering, recipient: prepared.to }),
  };
  const record = { ...prepared, state: "grant-verified", receipt, gift };
  await writeFile(file, JSON.stringify(record));
  return { file, record };
}
async function withNoticeToken(action) {
  const previous = process.env.FASTMAIL_JMAP_TOKEN;
  process.env.FASTMAIL_JMAP_TOKEN = "test-only";
  try { return await action(); }
  finally {
    if (previous === undefined) delete process.env.FASTMAIL_JMAP_TOKEN;
    else process.env.FASTMAIL_JMAP_TOKEN = previous;
  }
}
const validGrant = { shopRead: async id => ({ id, offering: "ice-out", status: "active" }) };

test("confirmed original grant sends one explicitly requested private notice, not a false receipt", async () =>
  withNoticeToken(async () => {
    const { file, record } = await noticeFixture();
    const notice = confirmedGiftNotice(record);
    assert.equal(notice.to, record.to);
    assert.ok(notice.body.includes(GIFT_URL));
    let sends = 0, reads = 0;
    const grant = { shopRead: async id => { reads++; return validGrant.shopRead(id); } };
    const send = async job => {
      sends++; assert.equal(job.to, record.to);
      return { accepted: true, status: "sent", provider: "fastmail-jmap", messageId: "notice-1", to: [job.to] };
    };
    const first = await deliverGiftNotice(file, { send, grant });
    const second = await deliverGiftNotice(file, { send, grant });
    assert.equal(first.state, "notice-accepted");
    assert.equal(second.state, "notice-accepted");
    assert.equal(first.noticeReceipt.messageId, "notice-1");
    assert.equal(first.recipientReceived, undefined);
    assert.equal(sends, 1); assert.equal(reads, 1);
    assert.equal((await runJob(file, { send: async () => { throw Error("must not resend"); } })).state, "notice-accepted");
  }));

test("ambiguous notice submission is held for reconciliation, not replayed", async () =>
  withNoticeToken(async () => {
    const { file } = await noticeFixture();
    let sends = 0;
    await assert.rejects(deliverGiftNotice(file, {
      grant: validGrant, send: async () => { sends++; throw Error("reply lost after send"); },
    }), /reply lost/u);
    assert.equal(JSON.parse(await readFile(file, "utf8")).state, "notice-uncertain");
    await assert.rejects(deliverGiftNotice(file, {
      grant: validGrant, send: async () => { sends++; throw Error("unapproved resend"); },
    }), /grant verification required/u);
    assert.equal(sends, 1);
  }));

test("revoked or changing grants and forged private links send no notice", async () =>
  withNoticeToken(async () => {
    const { file, record } = await noticeFixture();
    let sends = 0;
    const send = async () => { sends++; return {}; };
    await assert.rejects(deliverGiftNotice(file, {
      send, grant: { shopRead: async id => ({ id, offering: "ice-out", status: "revoked" }) },
    }), /absent, changed, or revoked/u);
    assert.equal(JSON.parse(await readFile(file, "utf8")).state, "grant-verified");
    for (const patch of [
      { gift: { ...record.gift, url: "https://evil.invalid/gifts/gift-test_1" } },
      { gift: { ...record.gift, reference: "forged" } },
      { gift: { ...record.gift, verified: false } },
      { receipt: { ...record.receipt, status: "draft" } },
      { state: "send-uncertain" },
    ]) {
      await writeFile(file, JSON.stringify({ ...record, ...patch }));
      await assert.rejects(deliverGiftNotice(file, { send, grant: validGrant }));
    }
    assert.equal(sends, 0);
  }));

test("a mismatched Fastmail notice receipt cannot become accepted delivery", async () =>
  withNoticeToken(async () => {
    const { file } = await noticeFixture();
    await assert.rejects(deliverGiftNotice(file, {
      grant: validGrant,
      send: async job => ({ accepted: true, status: "sent", provider: "fastmail-jmap",
        messageId: "n2", to: ["other@example.org"] }),
    }), /matching Fastmail receipt/u);
    const record = JSON.parse(await readFile(file, "utf8"));
    assert.equal(record.state, "notice-uncertain");
    assert.equal(record.noticeReceipt, undefined);
  }));

test("operator command keeps gift bearer ID and URL out of generic process output", async () => {
  const { file, record } = await noticeFixture();
  const child = spawnSync(process.execPath,
    ["scripts/promotional-gift-mail.mjs", "run", file],
    { cwd: process.cwd(), encoding: "utf8", timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.state, "grant-verified");
  assert.equal(result.recipientReceived, false);
  assert.equal(result.giftId, undefined);
  assert.equal(result.giftUrl, undefined);
  assert.ok(!child.stdout.includes(record.gift.id));
  assert.ok(!child.stdout.includes(record.gift.url));
});
