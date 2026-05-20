import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripSkillMarkers } from "./helpers.js";
import {
  CUSTOMER_RESPONSE_FALLBACK,
  detectInternalLeakage,
  prepareCustomerTextDraft,
  stripObviousLeakage,
} from "./customerResponse.js";

describe("customerResponse utils", () => {
  describe("detectInternalLeakage", () => {
    it("detects screenshot leakage: tools已call", () => {
      const leaky =
        "所有 tools 已 call，資料核對無誤。訂單 ORD-20260520-DC0UMI 已落好，記得付款後 send 入數紙俾我呀 Felix ☺️";
      assert.equal(detectInternalLeakage(leaky), true);
    });

    it("detects screenshot leakage: verifying status", () => {
      const leaky =
        "訂單 ORD-20260520-DC0UMI 已確認存在，payment 亦已更新為 verifying。之前嘅處理冇問題，流程完整。";
      assert.equal(detectInternalLeakage(leaky), true);
    });

    it("detects internal tool names", () => {
      assert.equal(detectInternalLeakage("Calling update_order_payment now"), true);
      assert.equal(detectInternalLeakage("Used document_data_capture successfully"), true);
      assert.equal(detectInternalLeakage("execute_skill returned"), true);
      assert.equal(detectInternalLeakage("google_sheets append_row done"), true);
    });

    it("detects internal product and shipping ids", () => {
      assert.equal(detectInternalLeakage("原條 / 原味 — HKD 350 (internal id: whole__original)"), true);
      assert.equal(detectInternalLeakage("variantId: whole__salted"), true);
      assert.equal(detectInternalLeakage("selectedOptionValueIds: [whole,salted]"), true);
      assert.equal(detectInternalLeakage("id: 665f28bcb6a9f986d7bbf123"), true);
      assert.equal(detectInternalLeakage("shippingMethodId: 665f28bcb6a9f986d7bbf123"), true);
    });

    it("detects skill internal markers if leaked", () => {
      assert.equal(detectInternalLeakage("Done SKILL_COMPLETE"), true);
      assert.equal(detectInternalLeakage("SKILL_OBSERVATIONS block"), true);
    });

    it("does not flag normal customer-facing text", () => {
      const clean = "已收到入數紙，同事會核對，核實後會再通知你。";
      assert.equal(detectInternalLeakage(clean), false);
    });

    it("does not flag order confirmation without internal terms", () => {
      const clean =
        "訂單 ORD-20260520-DC0UMI 已幫你落好，記得付款後 send 入數紙俾我呀 ☺️";
      assert.equal(detectInternalLeakage(clean), false);
    });

    it("does not flag simple greetings", () => {
      assert.equal(detectInternalLeakage("你好！有咩可以幫到你？"), false);
      assert.equal(detectInternalLeakage("You're welcome!"), false);
    });

    it("returns false for empty text", () => {
      assert.equal(detectInternalLeakage(""), false);
      assert.equal(detectInternalLeakage("   "), false);
    });
  });

  describe("stripObviousLeakage", () => {
    it("removes leaky lines but keeps order facts", () => {
      const leaky =
        "所有 tools 已 call，資料核對無誤。\n訂單 ORD-20260520-DC0UMI 已落好。";
      const stripped = stripObviousLeakage(leaky);
      assert.match(stripped, /ORD-20260520-DC0UMI/);
      assert.equal(detectInternalLeakage(stripped), false);
    });

    it("removes step narration lines", () => {
      const leaky = "Step 3: update_order_payment\n訂單已收到，多謝！";
      const stripped = stripObviousLeakage(leaky);
      assert.match(stripped, /訂單已收到/);
      assert.equal(/update_order_payment/i.test(stripped), false);
    });

    it("removes internal ids without dropping menu labels and prices", () => {
      const leaky =
        "原條 / 原味 — HKD 350 (internal id: whole__original)\n" +
        "原條 / 岩鹽焦糖味 — HKD 380 (id: whole__salted)\n" +
        "配送方式：代call車送貨 shippingMethodId: 665f28bcb6a9f986d7bbf123\n" +
        "internal record id: 665f28bcb6a9f986d7bbf123\n" +
        "selectedOptionValueIds: [whole,salted]";
      const stripped = stripObviousLeakage(leaky);
      assert.match(stripped, /原條 \/ 原味 — HKD 350/);
      assert.match(stripped, /原條 \/ 岩鹽焦糖味 — HKD 380/);
      assert.match(stripped, /配送方式：代call車送貨/);
      assert.doesNotMatch(stripped, /whole__original|whole__salted|shippingMethodId|selectedOptionValueIds|665f28/);
      assert.equal(detectInternalLeakage(stripped), false);
    });

    it("returns empty string when all lines are leaky", () => {
      const stripped = stripObviousLeakage("所有 tools 已 call\n流程完整");
      assert.equal(stripped, "");
    });
  });

  describe("prepareCustomerTextDraft", () => {
    it("strips skill HTML markers", () => {
      const draft = "Hello!\n<!-- skill:cake-booking:complete {\"order\":\"1\"} -->";
      assert.equal(prepareCustomerTextDraft(draft), "Hello!");
    });

    it("strips complete markers with observations JSON", () => {
      const draft =
        'Thanks!\n<!-- skill:cake-booking:complete {"orderNumber":"ORD-1","price":"440"} -->';
      assert.equal(prepareCustomerTextDraft(draft), "Thanks!");
    });

    it("strips in-progress skill markers", () => {
      const draft = "Working on it\n<!-- skill:cake-booking -->";
      assert.equal(prepareCustomerTextDraft(draft), "Working on it");
    });
  });

  describe("stripSkillMarkers (re-exported)", () => {
    it("handles CRLF and whitespace in marker", () => {
      const text = "Hi\r\n<!--  skill:cake-booking  -->";
      assert.equal(stripSkillMarkers(text), "Hi");
    });

    it("truncates orphan partial marker at end", () => {
      const text = "Hi there <!-- skill:cake";
      assert.equal(stripSkillMarkers(text), "Hi there");
    });
  });

  it("exports a safe fallback message", () => {
    assert.match(CUSTOMER_RESPONSE_FALLBACK, /已收到/);
    assert.equal(detectInternalLeakage(CUSTOMER_RESPONSE_FALLBACK), false);
  });
});
