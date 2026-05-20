import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  prepareCustomerFacingResponse,
  rewriteForCustomer,
} from "./customerResponse.service.js";
import {
  CUSTOMER_RESPONSE_FALLBACK,
  detectInternalLeakage,
} from "../utils/customerResponse.js";
import { aiLogger } from "./aiLogger.service.js";
import type { OpenRouterResponse } from "../agent/types.js";

function mockLlmResponse(content: string): OpenRouterResponse {
  return {
    id: "test",
    model: "test-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content },
      },
    ],
  };
}

describe("customerResponse.service", () => {
  beforeEach(() => {
    mock.method(aiLogger, "logError", async () => undefined);
  });

  afterEach(() => {
    mock.restoreAll();
  });
  describe("prepareCustomerFacingResponse", () => {
    it("returns clean draft without calling LLM", async () => {
      const clean = "已收到入數紙，同事會核對。";
      let llmCalls = 0;
      const result = await prepareCustomerFacingResponse({
        draft: clean,
        createChatCompletionFn: async () => {
          llmCalls += 1;
          throw new Error("should not call LLM");
        },
      });
      assert.equal(result, clean);
      assert.equal(llmCalls, 0);
    });

    it("strips leaked internal ids without calling LLM when heuristic is enough", async () => {
      const draft =
        "原條 / 岩鹽焦糖味 — HKD 380 (internal id: whole__salted)\n" +
        "配送方式：代call車送貨 shippingMethodId: 665f28bcb6a9f986d7bbf123";
      let llmCalls = 0;
      const result = await prepareCustomerFacingResponse({
        draft,
        createChatCompletionFn: async () => {
          llmCalls += 1;
          throw new Error("should not call LLM");
        },
      });
      assert.equal(llmCalls, 0);
      assert.match(result, /原條 \/ 岩鹽焦糖味 — HKD 380/);
      assert.match(result, /配送方式：代call車送貨/);
      assert.doesNotMatch(result, /whole__salted|shippingMethodId|665f28/);
      assert.equal(detectInternalLeakage(result), false);
    });

    it("rewrites leaky draft via fast LLM", async () => {
      const leaky =
        "所有 tools 已 call，資料核對無誤。訂單 ORD-20260520-DC0UMI 已落好。";
      let llmCalls = 0;
      const result = await prepareCustomerFacingResponse({
        draft: leaky,
        createChatCompletionFn: async () => {
          llmCalls += 1;
          return mockLlmResponse(
            "已收到你嘅入數紙，同事會核對，核實後會再通知你。",
          );
        },
      });
      assert.equal(llmCalls, 1);
      assert.equal(
        result,
        "已收到你嘅入數紙，同事會核對，核實後會再通知你。",
      );
      assert.equal(/tools/i.test(result), false);
    });

    it("strips skill markers before leakage check", async () => {
      const draft = "多謝！\n<!-- skill:cake-booking:complete {} -->";
      let llmCalls = 0;
      const result = await prepareCustomerFacingResponse({
        draft,
        createChatCompletionFn: async () => {
          llmCalls += 1;
          throw new Error("should not call LLM");
        },
      });
      assert.equal(result, "多謝！");
      assert.equal(llmCalls, 0);
    });

    it("returns empty string for empty draft", async () => {
      assert.equal(await prepareCustomerFacingResponse({ draft: "" }), "");
      assert.equal(await prepareCustomerFacingResponse({ draft: "   " }), "");
    });
  });

  describe("rewriteForCustomer fallback paths", () => {
    it("falls back to heuristic strip when LLM throws", async () => {
      const leaky =
        "所有 tools 已 call，資料核對無誤。\n訂單 ORD-99 已落好。";
      const result = await rewriteForCustomer({
        draft: leaky,
        createChatCompletionFn: async () => {
          throw new Error("API down");
        },
      });
      assert.match(result, /ORD-99/);
      assert.equal(detectInternalLeakage(result), false);
    });

    it("falls back to heuristic strip on draft when LLM rewrite still leaks", async () => {
      const leaky = "payment 亦已更新為 verifying。\n訂單 ORD-88 已確認。";
      const result = await rewriteForCustomer({
        draft: leaky,
        createChatCompletionFn: async () =>
          mockLlmResponse("Still leaking: verifying and tools called"),
      });
      assert.match(result, /ORD-88/);
      assert.equal(detectInternalLeakage(result), false);
    });

    it("returns safe fallback when LLM and heuristic strip both fail", async () => {
      const leaky = "payment 亦已更新為 verifying。tools called";
      const result = await rewriteForCustomer({
        draft: leaky,
        createChatCompletionFn: async () =>
          mockLlmResponse("Still leaking: verifying and tools called"),
      });
      assert.equal(result, CUSTOMER_RESPONSE_FALLBACK);
      assert.equal(detectInternalLeakage(result), false);
    });

    it("returns safe fallback when draft is entirely leaky", async () => {
      const result = await rewriteForCustomer({
        draft: "所有 tools 已 call，流程完整，payment 亦已更新為 verifying",
        createChatCompletionFn: async () => {
          throw new Error("API down");
        },
      });
      assert.equal(result, CUSTOMER_RESPONSE_FALLBACK);
    });

    it("returns empty LLM response via heuristic strip then fallback", async () => {
      const result = await rewriteForCustomer({
        draft: "tools called, verifying",
        createChatCompletionFn: async () => mockLlmResponse(""),
      });
      assert.equal(result, CUSTOMER_RESPONSE_FALLBACK);
    });

    it("preserves order ID from screenshot scenario after rewrite", async () => {
      const leaky =
        "訂單 ORD-20260520-DC0UMI 已確認存在，payment 亦已更新為 verifying。之前嘅處理冇問題，流程完整。";
      const result = await rewriteForCustomer({
        draft: leaky,
        createChatCompletionFn: async () =>
          mockLlmResponse(
            "多謝 Felix！已收到你嘅入數紙，訂單 ORD-20260520-DC0UMI 核對緊，確認後會再通知你。",
          ),
      });
      assert.match(result, /ORD-20260520-DC0UMI/);
      assert.equal(detectInternalLeakage(result), false);
    });
  });
});
