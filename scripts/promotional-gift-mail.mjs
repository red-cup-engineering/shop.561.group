#!/usr/bin/env node
// Real promotional send + retail gift, using Fastmail JMAP and existing shop grants.
// A one-recipient job is persisted before submission. An uncertain send is NEVER
// automatically repeated: reconcile it against Fastmail first to avoid duplicates.
import { readFile, writeFile, rename, mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { fulfillPromotionalSend, grantReference, shopGiftAdapters } from "../src/promotion-email-gifts.mjs";

const USINGS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"];
const fail = (message) => { throw new Error(message); };
const required = (value, name) => typeof value === "string" && value.trim() ? value.trim() : fail(`missing ${name}`);
const email = (value) => { const v = required(value, "email"); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v)) fail("invalid email"); return v.toLowerCase(); };
async function save(file, value) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await rename(temp, file);
}
async function requestJson(url, token, body, fetchImpl = fetch) {
  const r = await fetchImpl(url, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) fail(`Fastmail HTTP ${r.status}`);
  return r.json();
}
function response(data, type, id) {
  const match = data.methodResponses?.find(x => x[0] === type && x[2] === id);
  if (!match) fail(`JMAP ${type} missing response`);
  return match[1];
}
export async function sendFastmail(job, token, fetchImpl = fetch) {
  const session = await requestJson("https://api.fastmail.com/jmap/session", token, undefined, fetchImpl);
  const accountId = session.primaryAccounts?.["urn:ietf:params:jmap:submission"];
  const mailAccountId = session.primaryAccounts?.["urn:ietf:params:jmap:mail"];
  if (!accountId || !mailAccountId || accountId !== mailAccountId || !session.apiUrl) fail("Fastmail mail/submission account unavailable or mismatched");
  const ids = await requestJson(session.apiUrl, token, { using: USINGS, methodCalls: [
    ["Identity/get", { accountId }, "identities"],
    ["Mailbox/query", { accountId: mailAccountId, filter: { role: "drafts" } }, "drafts"]
  ] }, fetchImpl);
  const identity = response(ids, "Identity/get", "identities").list?.find(i => i.email?.toLowerCase() === job.from);
  if (!identity) fail("sender is not a verified Fastmail identity");
  const draftsId = response(ids, "Mailbox/query", "drafts").ids?.[0];
  if (!draftsId) fail("Fastmail drafts mailbox unavailable");
  // The JMAP response must acknowledge actual EmailSubmission creation.
  const draft = { from: [{ email: job.from }], to: [{ email: job.to }], subject: job.subject, mailboxIds: { [draftsId]: true }, textBody: [{ partId: "body", type: "text/plain" }], bodyValues: { body: { value: job.body } }, keywords: { "$draft": true } };
  const result = await requestJson(session.apiUrl, token, { using: USINGS, methodCalls: [
    ["Email/set", { accountId, create: { draft } }, "draft"],
    ["EmailSubmission/set", { accountId, create: { submission: { emailId: "#draft", identityId: identity.id } }, onSuccessDestroyEmail: ["#submission"] }, "submission"]
  ] }, fetchImpl);
  const createdDraft = response(result, "Email/set", "draft").created?.draft;
  const submitted = response(result, "EmailSubmission/set", "submission");
  if (!createdDraft?.id || !submitted.created?.submission?.id) fail("Fastmail did not acknowledge submission; verify remotely before retrying");
  return { accepted: true, status: "sent", provider: "fastmail-jmap", messageId: submitted.created.submission.id, to: [job.to] };
}
/**
 * A grant is NOT a delivery. A gift URL is a bearer-accessible download and
 * must match the shop's original grant exactly; never mail an arbitrary URL
 * or report recipient access from a provider's send acknowledgment.
 */
export function confirmedGiftNotice(record) {
  if (record?.state !== "grant-verified") fail("grant verification required before notifying a recipient");
  const receipt = record.receipt, gift = record.gift;
  const to = email(record.to);
  const offering = required(record.offering, "offering");
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(offering)) fail("invalid offering identity");
  if (!receipt?.accepted || receipt.status !== "sent" || receipt.draft === true || receipt.failed === true
      || !receipt.messageId || !receipt.provider || receipt.to?.length !== 1 || email(receipt.to[0]) !== to) {
    fail("original accepted mail receipt required");
  }
  const expectedRef = grantReference({ provider: receipt.provider, messageId: receipt.messageId, offering, recipient: to });
  if (gift?.verified !== true || gift.reference !== expectedRef
      || typeof gift.id !== "string" || !/^gift-[A-Za-z0-9_-]+$/u.test(gift.id)
      || gift.url !== `https://shop.561.group/gifts/${gift.id}`) {
    fail("confirmed original shop grant and exact private link required");
  }
  return {
    from: email(record.from), to,
    subject: "Your 561 Group book gift is ready",
    body: `Your copy of ${offering} is now available from the 561 Group Shop.\n\n${gift.url}\n\nThis link allows anyone holding it to download the book. Please keep it private. Receipt of this email is not confirmation that you have accessed the book.`,
  };
}

/** Explicit second-stage operator action. No automatic retry after uncertain
 * JMAP transport, no fake recipient delivery and no grant on a draft.
 */
export async function deliverGiftNotice(file, { send = sendFastmail, grant } = {}) {
  const lock = file + ".lock";
  const handle = await open(lock, "wx", 0o600);
  try {
    const record = JSON.parse(await readFile(file, "utf8"));
    if (record.state === "notice-accepted") return record;
    const notice = confirmedGiftNotice(record);
    const token = required(process.env.FASTMAIL_JMAP_TOKEN, "FASTMAIL_JMAP_TOKEN");
    const adapters = grant ?? shopGiftAdapters({ key: required(process.env.SHOP_GIFT_AGENT_KEY, "SHOP_GIFT_AGENT_KEY") });
    if (typeof adapters.shopRead !== "function") fail("authenticated grant reader required");
    // An old confirmed grant can have been revoked since the first readback.
    const readback = await adapters.shopRead(record.gift.id);
    const current = readback?.gift ?? readback;
    if (current?.id !== record.gift.id || current.offering !== record.offering || current.status !== "active") {
      fail("current shop grant is absent, changed, or revoked");
    }
    record.state = "notice-uncertain";
    await save(file, record);
    // If Fastmail succeeds but this call or the following save fails, the
    // uncertain record forbids replay pending provider-side reconciliation.
    const acknowledged = await send(notice, token);
    if (acknowledged?.accepted !== true || acknowledged.status !== "sent"
        || acknowledged.provider !== "fastmail-jmap" || !acknowledged.messageId
        || acknowledged.to?.length !== 1 || email(acknowledged.to[0]) !== notice.to) {
      fail("notice submission has no accepted, matching Fastmail receipt");
    }
    record.noticeReceipt = {
      provider: "fastmail-jmap", messageId: acknowledged.messageId,
      accepted: true, status: "sent", to: [notice.to],
    };
    record.state = "notice-accepted";
    await save(file, record);
    return record;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}

export async function runJob(file, { send = sendFastmail, grant } = {}) {
  const lock = file + ".lock";
  const handle = await open(lock, "wx", 0o600);
  try {
  const record = JSON.parse(await readFile(file, "utf8"));
  // Historical jobs called grant API readback "received" without independently
  // observing a reader download. Normalize that inaccurate state without re-sending.
  if (record.state === "received") { record.state = "grant-verified"; await save(file, record); }
  if (record.state === "grant-verified" || record.state === "notice-accepted") return record;
  if (!["prepared", "send-accepted", "grant-failed"].includes(record.state)) fail("unknown or uncertain send state; reconcile manually, do not resend");
  const key = required(process.env.SHOP_GIFT_AGENT_KEY, "SHOP_GIFT_AGENT_KEY");
  const adapters = grant ?? shopGiftAdapters({ key });
  if (record.state === "prepared") {
    const token = required(process.env.FASTMAIL_JMAP_TOKEN, "FASTMAIL_JMAP_TOKEN");
    record.state = "send-uncertain";
    await save(file, record);
    // A crash between JMAP submission and receipt persistence leaves send-uncertain.
    // Operator MUST verify the JMAP submission before changing state.
    const receipt = await send(record, token);
    if (!receipt?.accepted || receipt.status !== "sent" || receipt.to?.length !== 1 || email(receipt.to[0]) !== record.to || !receipt.messageId) fail("mail submission was not verified");
    record.receipt = receipt;
    record.state = "send-accepted";
    await save(file, record);
  }
  try {
    const result = await fulfillPromotionalSend({ receipt: record.receipt, offering: record.offering, recipient: record.to, ...adapters });
    record.gift = result;
    // A grant API readback is not evidence of recipient access or download.
    record.state = "grant-verified";
    await save(file, record);
    return record;
  } catch (error) {
    record.state = "grant-failed";
    record.lastError = error.message;
    await save(file, record);
    throw error;
  }
  } finally { await handle.close(); await unlink(lock); }
}
export async function prepareJob(file, spec) {
  const job = { state: "prepared", id: randomUUID(), from: email(spec.from), to: email(spec.to), offering: required(spec.offering, "offering"), subject: required(spec.subject, "subject"), body: required(spec.body, "body") };
  if (job.to === job.from) fail("self-send not a recipient gift");
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(job, null, 2) + "\n"); } finally { await handle.close(); }
  return job;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, path, specification] = process.argv.slice(2);
  try {
    if (!path || !["prepare", "run", "deliver"].includes(mode)) fail("usage: node scripts/promotional-gift-mail.mjs prepare JOB.json SPEC.json | run JOB.json | deliver JOB.json");
    const file = resolve(path);
    if (mode === "prepare") {
      if (!specification) fail("provide SPEC.json");
      const spec = JSON.parse(await readFile(resolve(specification), "utf8"));
      await prepareJob(file, spec);
      console.log("Prepared private promotional gift job");
    } else if (mode === "run") {
      const result = await runJob(file);
      // The grant ID itself reconstructs the bearer link; keep both in
      // the operator's mode-0600 job, never generic process logs.
      console.log(JSON.stringify({ state: result.state, recipientReceived: false }));
    } else {
      const result = await deliverGiftNotice(file);
      // JMAP submission acceptance is not a recipient read or download.
      console.log(JSON.stringify({ state: result.state, recipientReceived: false }));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
