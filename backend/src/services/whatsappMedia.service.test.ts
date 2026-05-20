import assert from "node:assert/strict";

import {
  buildMediaProxyUrl,
  isWhatsAppCdnUrl,
  needsPersistedReceiptCopy,
  parseMessageIdFromMediaUrl,
} from "./whatsappMedia.service.js";

const MSG_ID = "64f000000000000000000099";

function testWhatsAppCdnDetection() {
  assert.equal(
    isWhatsAppCdnUrl("https://mmg.whatsapp.net/o1/v/t24/f2/m234/example"),
    true,
  );
  assert.equal(
    isWhatsAppCdnUrl("https://mmg-fna.whatsapp.net/d/f/abc.enc"),
    true,
  );
  assert.equal(isWhatsAppCdnUrl("https://example.com/receipt.jpg"), false);
}

function testParseMessageIdFromMediaUrl() {
  assert.equal(
    parseMessageIdFromMediaUrl(`https://api.example.com/api/media/${MSG_ID}`),
    MSG_ID,
  );
  assert.equal(parseMessageIdFromMediaUrl(`/api/media/${MSG_ID}`), MSG_ID);
  assert.equal(parseMessageIdFromMediaUrl("https://mmg.whatsapp.net/x"), undefined);
}

function testNeedsPersistedReceiptCopy() {
  assert.equal(
    needsPersistedReceiptCopy("https://mmg.whatsapp.net/o1/v/t24/f2/m234/example"),
    true,
  );
  assert.equal(
    needsPersistedReceiptCopy(`https://api.example.com/api/media/${MSG_ID}`),
    true,
  );
  assert.equal(
    needsPersistedReceiptCopy("https://cdn.example.com/uploads/order-receipts/a.jpg"),
    false,
  );
  assert.equal(
    needsPersistedReceiptCopy("/uploads/order-receipts/Receipt-ORD-1.jpg"),
    false,
  );
}

function testBuildMediaProxyUrl() {
  const prev = process.env.PUBLIC_API_URL;
  process.env.PUBLIC_API_URL = "https://api.example.com";
  try {
    assert.equal(buildMediaProxyUrl(MSG_ID), `https://api.example.com/api/media/${MSG_ID}`);
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = prev;
  }
}

testWhatsAppCdnDetection();
testParseMessageIdFromMediaUrl();
testNeedsPersistedReceiptCopy();
testBuildMediaProxyUrl();

console.log("whatsappMedia.service checks passed.");
