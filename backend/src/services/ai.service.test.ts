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
        notifyPhoneNumber: "85291234567",
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
      assert.match(String(sendMock.mock.calls[0]!.arguments[1]), /85291234567/);
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
          notifyPhoneNumber: "85291234567",
        },
        moderationMatch,
      );
      assert.equal(sendMock.mock.calls.length, 0);
    });

    it("notify failure does not throw", async () => {
      sendMock = mock.fn(async () => {
        throw new Error("wa down");
      });
      mock.method(messageService, "sendViaWhatsApp", sendMock);

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
            notifyPhoneNumber: "85291234567",
          },
          moderationMatch,
        ),
      );
    });
  });
});
