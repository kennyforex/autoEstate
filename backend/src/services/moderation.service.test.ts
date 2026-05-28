import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  match,
  getDefaultModerationSettings,
  normalizeModerationSettings,
  validateModerationSettings,
  buildNotifyText,
  truncateForNotify,
  shouldNotify,
  applyFolderActions,
  mergeModerationSettings,
  dispatchModerationNotifications,
} from "./moderation.service.js";
import { conversationService } from "./conversation.service.js";
import { messageService } from "./message.service.js";

describe("moderation.service", () => {
  const defaults = getDefaultModerationSettings();

  describe("match", () => {
    it("matches English profanity case-insensitively", () => {
      assert.ok(match("you fuck", defaults)?.matchedPhrase === "fuck");
      assert.ok(match("FUCK you", defaults)?.category.id === "english-profanity");
    });

    it("matches Chinese profanity on original text", () => {
      const result = match("你是廢物", defaults);
      assert.equal(result?.category.id, "chinese-profanity");
      assert.equal(result?.matchedPhrase, "廢物");
    });

    it("matches complaint phrase", () => {
      const result = match("我要投诉", defaults);
      assert.equal(result?.category.id, "complaint-scam");
    });

    it("returns null for benign text", () => {
      assert.equal(match("Hi, thank you for your support today!", defaults), null);
    });

    it("returns null when company moderation disabled", () => {
      assert.equal(
        match("fuck", { ...defaults, enabled: false }),
        null,
      );
    });

    it("skips disabled categories", () => {
      const settings = {
        ...defaults,
        categories: defaults.categories.map((c) =>
          c.id === "english-profanity" ? { ...c, enabled: false } : c,
        ),
      };
      assert.equal(match("fuck", settings), null);
    });

    it("first enabled category wins when phrases overlap", () => {
      const settings = normalizeModerationSettings({
        enabled: true,
        notifyEnabled: false,
        notifyPhoneNumbers: [],
        notifyEmails: [],
        categories: [
          {
            id: "a",
            name: "A",
            enabled: true,
            phrases: ["bad"],
            inboxFolder: "attention",
          },
          {
            id: "b",
            name: "B",
            enabled: true,
            phrases: ["badword"],
            inboxFolder: "negative",
          },
        ],
      });
      assert.equal(match("this is bad today", settings)?.category.id, "a");
    });

    it("ignores empty phrases after normalize", () => {
      const settings = normalizeModerationSettings({
        enabled: true,
        notifyEnabled: false,
        notifyPhoneNumbers: [],
        notifyEmails: [],
        categories: [
          {
            id: "x",
            name: "X",
            enabled: true,
            phrases: ["   ", "hit"],
            inboxFolder: "attention",
          },
        ],
      });
      assert.equal(match("nothing", settings), null);
      assert.ok(match("hit me", settings));
    });
  });

  describe("buildNotifyText / truncateForNotify / shouldNotify", () => {
    it("buildNotifyText includes category, contact, channel, body", () => {
      const text = buildNotifyText({
        categoryName: "English profanity",
        contactLabel: "Alice",
        channelName: "Support WA",
        messageContent: "bad message",
      });
      assert.match(text, /\[Moderation\] English profanity/);
      assert.match(text, /Contact: Alice/);
      assert.match(text, /Channel: Support WA/);
      assert.match(text, /bad message/);
    });

    it("truncateForNotify shortens long text", () => {
      const long = "x".repeat(600);
      const out = truncateForNotify(long, 500);
      assert.ok(out.length <= 500);
      assert.ok(out.endsWith("…"));
    });

    it("shouldNotify respects moderationAlertsSent", () => {
      assert.equal(shouldNotify([], "cat-1"), true);
      assert.equal(shouldNotify(["cat-1"], "cat-1"), false);
      assert.equal(shouldNotify(["cat-1"], "cat-2"), true);
    });
  });

  describe("normalizeModerationSettings / validateModerationSettings", () => {
    it("caps categories and phrases", () => {
      const manyCategories = Array.from({ length: 25 }, (_, i) => ({
        id: `c${i}`,
        name: `C${i}`,
        enabled: true,
        phrases: Array.from({ length: 250 }, (_, j) => `p${i}-${j}`),
        inboxFolder: "attention" as const,
      }));
      const normalized = normalizeModerationSettings({
        enabled: true,
        notifyEnabled: false,
        notifyPhoneNumbers: [],
        notifyEmails: [],
        categories: manyCategories,
      });
      assert.equal(normalized.categories.length, 20);
      assert.equal(normalized.categories[0]!.phrases.length, 200);
    });

    it("migrates legacy notifyPhoneNumber", () => {
      const normalized = normalizeModerationSettings({
        enabled: true,
        categories: [],
        notifyEnabled: true,
        notifyPhoneNumber: "85265530922",
      });
      assert.deepEqual(normalized.notifyPhoneNumbers, ["85265530922"]);
      assert.deepEqual(normalized.notifyEmails, []);
    });

    it("deduplicates and caps notify recipients", () => {
      const normalized = normalizeModerationSettings({
        enabled: true,
        categories: [],
        notifyEnabled: true,
        notifyPhoneNumbers: [
          "85261111111",
          "85261111111",
          "+852-62222222",
          ...Array.from({ length: 12 }, (_, i) => `8526333333${i}`),
        ],
        notifyEmails: [
          "a@example.com",
          "A@example.com",
          ...Array.from({ length: 12 }, (_, i) => `user${i}@example.com`),
        ],
      });
      assert.equal(normalized.notifyPhoneNumbers.length, 10);
      assert.equal(normalized.notifyPhoneNumbers[0], "85261111111");
      assert.equal(normalized.notifyPhoneNumbers[1], "85262222222");
      assert.equal(normalized.notifyEmails.length, 10);
      assert.equal(normalized.notifyEmails[0], "a@example.com");
    });

    it("validateModerationSettings rejects notify without recipients", () => {
      const err = validateModerationSettings({
        enabled: true,
        categories: [],
        notifyEnabled: true,
        notifyPhoneNumbers: [],
        notifyEmails: [],
      });
      assert.ok(err);
      assert.match(err!, /at least one notify recipient/i);
    });

    it("validateModerationSettings rejects invalid email", () => {
      const err = validateModerationSettings({
        enabled: true,
        categories: [],
        notifyEnabled: true,
        notifyPhoneNumbers: [],
        notifyEmails: ["not-an-email"],
      });
      assert.ok(err);
      assert.match(err!, /invalid email/i);
    });
  });

  describe("dispatchModerationNotifications", () => {
    let sendMock: ReturnType<typeof mock.fn>;

    beforeEach(() => {
      sendMock = mock.fn(async () => "msg-id");
      mock.method(messageService, "sendViaWhatsApp", sendMock);
    });

    afterEach(() => {
      mock.restoreAll();
    });

    it("sends to all phone numbers in parallel", async () => {
      const anySent = await dispatchModerationNotifications({
        evolutionInstanceName: "inst",
        notifyText: "alert body",
        phoneNumbers: ["85291111111", "85292222222"],
        emails: [],
        onError: () => undefined,
      });
      assert.equal(anySent, true);
      assert.equal(sendMock.mock.calls.length, 2);
    });

    it("returns true when at least one phone succeeds", async () => {
      sendMock = mock.fn(async (instance: string, phone: string) => {
        if (phone === "85292222222") return "msg-id";
        throw new Error("wa down");
      });
      mock.method(messageService, "sendViaWhatsApp", sendMock);
      const anySent = await dispatchModerationNotifications({
        evolutionInstanceName: "inst",
        notifyText: "alert body",
        phoneNumbers: ["85291111111", "85292222222"],
        emails: [],
        onError: () => undefined,
      });
      assert.equal(anySent, true);
    });

    it("returns false when all phone sends fail", async () => {
      sendMock = mock.fn(async () => {
        throw new Error("wa down");
      });
      mock.method(messageService, "sendViaWhatsApp", sendMock);
      const anySent = await dispatchModerationNotifications({
        evolutionInstanceName: "inst",
        notifyText: "alert body",
        phoneNumbers: ["85291111111"],
        emails: [],
        onError: () => undefined,
      });
      assert.equal(anySent, false);
    });
  });

  describe("mergeModerationSettings", () => {
    it("returns defaults when stored is missing", () => {
      const merged = mergeModerationSettings(undefined);
      assert.equal(merged.categories.length, 3);
      assert.ok(merged.categories.some((c) => c.id === "english-profanity"));
    });
  });

  describe("applyFolderActions", () => {
    let updateMock: ReturnType<typeof mock.fn>;
    let signalsMock: ReturnType<typeof mock.fn>;

    beforeEach(() => {
      updateMock = mock.fn(async () => null);
      signalsMock = mock.fn(async () => null);
      mock.method(conversationService, "update", updateMock);
      mock.method(conversationService, "updateAISignals", signalsMock);
    });

    afterEach(() => {
      mock.restoreAll();
    });

    it("attention sets needsAttention only", async () => {
      await applyFolderActions("conv1", "attention");
      assert.equal(updateMock.mock.calls.length, 1);
      assert.deepEqual(updateMock.mock.calls[0]!.arguments[1], {
        needsAttention: true,
      });
      assert.equal(signalsMock.mock.calls.length, 0);
    });

    it("negative sets sentiment and needsAttention", async () => {
      await applyFolderActions("conv1", "negative");
      assert.equal(updateMock.mock.calls.length, 1);
      assert.equal(signalsMock.mock.calls.length, 1);
      assert.deepEqual(signalsMock.mock.calls[0]!.arguments[1], {
        sentiment: "negative",
      });
    });

    it("priority sets priority 8", async () => {
      await applyFolderActions("conv1", "priority");
      assert.deepEqual(signalsMock.mock.calls[0]!.arguments[1], {
        priority: 8,
      });
    });

    it("slaRisk sets slaRisk and priority", async () => {
      await applyFolderActions("conv1", "slaRisk");
      assert.deepEqual(signalsMock.mock.calls[0]!.arguments[1], {
        slaRisk: true,
        priority: 8,
      });
    });

    it("spam sets status spam", async () => {
      await applyFolderActions("conv1", "spam");
      assert.deepEqual(updateMock.mock.calls[0]!.arguments[1], {
        status: "spam",
      });
    });
  });
});
