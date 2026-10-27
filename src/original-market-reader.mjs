/**
 * One bounded, encoding-strict reader for public original Market responses.
 * Neither Shop browsing, details nor comparison may create alternate catalog
 * authority, accept redirects, interpret payment or buffer arbitrary bodies.
 */
export const MAX_ORIGINAL_MARKET_BYTES = 4_000_000;

export async function readBoundedOriginalMarketJson(response) {
  if (!response?.body) throw new TypeError("Original seller returned an empty body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ORIGINAL_MARKET_BYTES)
        throw new TypeError("Seller read exceeds expected size");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes));
}
