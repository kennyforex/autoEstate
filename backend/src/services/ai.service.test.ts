import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AIService } from "./ai.service.js";
import {
  getDefaultModerationSettings,
  match,
  moderationService,
} from "./moderation.service.js";
import { conversationService } from "./conversation.service.js";
import { messageService } from "./message.service.js";
import { customerResponseService } from "./customerResponse.service.js";
import { Conversation } from "../models/index.js";

describe("ai.service moderation", () => {
  const defaults = getDefaultModerationSettings();

  it("dual gate: company disabled skips match usage", () => {
    const settings = { ...defaults, enabled: false };
    assert.equal(match("fuck", settings), null);
  });

  it("dual gate: channel detect off is enforced in processMessage branch (match still works at service level)", () => {
    assert.ok(match("fuck", defaults));
  });

  describe("applyModerationEffects", () => {
    const svc = new AIService();
    const apply = (
      svc as unknown as {
        applyModerationEffects: (
          conversationId: string,
          channel: { name: string; evolutionInstanceName: string },
          contact: { name?: string; phoneNumber?: string; whatsappId?: string },
          effectiveContent: string,
          moderationSettings: ReturnType<typeof getDefaultModerationSettings>,
          moderationMatch: NonNullable<ReturnType<typeof match>>,
        ) => Promise<void>;
      }
    ).applyModerationEffects.bind(svc);

    let folderMock: ReturnType<typeof mock.fn>;
    let recordMock: ReturnType<typeof mock.fn>;
    let markAlertMock: ReturnType<typeof mock.fn>;
    let sendMock: ReturnType<typeof mock.fn>;

    beforeEach(() => {
      folderMock = mock.fn(async () => undefined);
      recordMock = mock.fn(async () => null);
      markAlertMock = mock.fn(async () => null);
      sendMock = mock.fn(async () => "msg-id");

      mock.method(moderationService, "applyFolderActions", folderMock);
      mock.method(conversationService, "recordModerationMatch", recordMock);
      mock.method(conversationService, "markModerationAlertSent", markAlertMock);
      mock.method(messageService, "sendViaWhatsApp", sendMock);

      mock.method(Conversation, "findById", () => ({
        select: () => ({
          lean: async () => ({ moderationAlertsSent: [] }),
        }),
      }));
    });

    afterEach(() => {
      mock.restoreAll();
    });

    it("applies folder actions and records match", async () => {
      const moderationMatch = match("廢物", defaults)!;
      await apply(
        "conv1",
        { name: "WA", evolutionInstanceName: "inst" },
        { name: "Bob" },
        "你是廢物",
        defaults,
        moderationMatch,
      );
      assert.equal(folderMock.mock.calls.length, 1);
      assert.equal(folderMock.mock.calls[0]!.arguments[1], "attention");
      assert.equal(recordMock.mock.calls.length, 1);
    });

    it("sends manager notify once when enabled", async () => {
      const moderationMatch = match("fuck", defaults)!;
      const settings = {
        ...defaults,
        notifyEnabled: true,
        notifyPhoneNumbers: ["85291234567"],
        notifyEmails: [],
      };
      await apply(
        "conv1",
        { name: "WA", evolutionInstanceName: "inst" },
        { name: "Bob" },
        "fuck off",
        settings,
        moderationMatch,
      );
      assert.equal(sendMock.mock.calls.length, 1);
      assert.equal(sendMock.mock.calls[0]!.arguments[1], "85291234567");
      assert.equal(markAlertMock.mock.calls.length, 1);
    });

    it("sends notify to multiple WhatsApp numbers and emails", async () => {
      const moderationMatch = match("fuck", defaults)!;
      const settings = {
        ...defaults,
        notifyEnabled: true,
        notifyPhoneNumbers: ["85291111111", "85292222222"],
        notifyEmails: ["manager@example.com", "ops@example.com"],
      };
      await apply(
        "conv1",
        { name: "WA", evolutionInstanceName: "inst" },
        { name: "Bob" },
        "fuck off",
        settings,
        moderationMatch,
      );
      assert.equal(sendMock.mock.calls.length, 2);
      assert.equal(markAlertMock.mock.calls.length, 1);
    });

    it("skips notify when category already alerted", async () => {
      mock.restoreAll();
      folderMock = mock.fn(async () => undefined);
      mock.method(moderationService, "applyFolderActions", folderMock);
      mock.method(conversationService, "recordModerationMatch", async () => null);
      mock.method(messageService, "sendViaWhatsApp", sendMock);

      mock.method(Conversation, "findById", () => ({
        select: () => ({
          lean: async () => ({
            moderationAlertsSent: ["english-profanity"],
          }),
        }),
      }));

      const moderationMatch = match("fuck", defaults)!;
      await apply(
        "conv1",
        { name: "WA", evolutionInstanceName: "inst" },
        { name: "Bob" },
        "fuck",
        {
          ...defaults,
          notifyEnabled: true,
          notifyPhoneNumbers: ["85291234567"],
          notifyEmails: [],
        },
        moderationMatch,
      );
      assert.equal(sendMock.mock.calls.length, 0);
    });

    it("notify failure does not throw when all channels fail", async () => {
      sendMock = mock.fn(async () => {
        throw new Error("wa down");
      });
      const dispatchMock = mock.fn(async () => false);
      mock.method(messageService, "sendViaWhatsApp", sendMock);
      mock.method(
        moderationService,
        "dispatchModerationNotifications",
        dispatchMock,
      );

      const moderationMatch = match("fuck", defaults)!;
      await assert.doesNotReject(() =>
        apply(
          "conv1",
          { name: "WA", evolutionInstanceName: "inst" },
          { name: "Bob" },
          "fuck",
          {
            ...defaults,
            notifyEnabled: true,
            notifyPhoneNumbers: ["85291234567"],
            notifyEmails: ["ops@example.com"],
          },
          moderationMatch,
        ),
      );
      assert.equal(markAlertMock.mock.calls.length, 0);
    });

    it("marks alert sent when dispatch reports success", async () => {
      const dispatchMock = mock.fn(async () => true);
      mock.method(
        moderationService,
        "dispatchModerationNotifications",
        dispatchMock,
      );

      const moderationMatch = match("fuck", defaults)!;
      await apply(
        "conv1",
        { name: "WA", evolutionInstanceName: "inst" },
        { name: "Bob" },
        "fuck",
        {
          ...defaults,
          notifyEnabled: true,
          notifyPhoneNumbers: ["85291234567"],
          notifyEmails: ["ops@example.com"],
        },
        moderationMatch,
      );
      assert.equal(dispatchMock.mock.calls.length, 1);
      assert.equal(markAlertMock.mock.calls.length, 1);
    });
  });
});

describe("ai.service sendWhatsAppAIContent", () => {
  const svc = new AIService();
  const sendWhatsApp = (
    svc as unknown as {
      sendWhatsAppAIContent: (params: {
        conversationId: string;
        channel: {
          evolutionInstanceName: string;
          assistantId?: { toString(): string };
          _id: { toString(): string };
        };
        senderId: string;
        aiResponseContent: string;
        citations: undefined;
      }) => Promise<void>;
    }
  ).sendWhatsAppAIContent.bind(svc);

  let sendViaWhatsAppMock: ReturnType<typeof mock.fn>;
  let createMessageMock: ReturnType<typeof mock.fn>;
  let prepareMock: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    sendViaWhatsAppMock = mock.fn(async () => "evo-msg-id");
    createMessageMock = mock.fn(async () => ({ _id: "db-msg-id" }));
    prepareMock = mock.fn(async ({ draft }: { draft: string }) => draft);

    mock.method(messageService, "sendViaWhatsApp", sendViaWhatsAppMock);
    mock.method(messageService, "create", createMessageMock);
    mock.method(
      customerResponseService,
      "prepareCustomerFacingResponse",
      prepareMock,
    );
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("sanitizes content via prepareCustomerFacingResponse before WhatsApp send", async () => {
    const leaky =
      "所有 tools 已 call。訂單 ORD-1 已落好。";
    prepareMock = mock.fn(async () => "已收到，訂單 ORD-1 已落好。");
    mock.method(
      customerResponseService,
      "prepareCustomerFacingResponse",
      prepareMock,
    );

    await sendWhatsApp({
      conversationId: "conv-leak",
      channel: {
        evolutionInstanceName: "inst",
        assistantId: { toString: () => "asst-1" },
        _id: { toString: () => "ch-1" },
      },
      senderId: "85261234567",
      aiResponseContent: leaky,
      citations: undefined,
    });

    assert.equal(prepareMock.mock.calls.length, 1);
    const prepArgs = prepareMock.mock.calls[0]!.arguments[0] as {
      draft: string;
      assistantId?: string;
    };
    assert.equal(prepArgs.draft, leaky);
    assert.equal(prepArgs.assistantId, "asst-1");
    assert.equal(sendViaWhatsAppMock.mock.calls.length, 1);
    assert.equal(sendViaWhatsAppMock.mock.calls[0]!.arguments[2], "已收到，訂單 ORD-1 已落好。");
    const savedArgs = createMessageMock.mock.calls[0]!.arguments[0] as { content: string };
    assert.equal(savedArgs.content, "已收到，訂單 ORD-1 已落好。");
  });

  it("passes clean content through unchanged when sanitizer returns as-is", async () => {
    const clean = "你好！有咩可以幫到你？";

    await sendWhatsApp({
      conversationId: "conv-clean",
      channel: {
        evolutionInstanceName: "inst",
        _id: { toString: () => "ch-1" },
      },
      senderId: "85261234567",
      aiResponseContent: clean,
      citations: undefined,
    });

    assert.equal(sendViaWhatsAppMock.mock.calls[0]!.arguments[2], clean);
  });
});
