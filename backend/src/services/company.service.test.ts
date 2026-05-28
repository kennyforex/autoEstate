import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { companyService } from "./company.service.js";
import { mergeModerationSettings } from "./moderation.service.js";

describe("company.service moderation", () => {
  it("mergeModerationSettings returns three default categories when missing", () => {
    const merged = mergeModerationSettings(undefined);
    assert.equal(merged.categories.length, 3);
    assert.equal(merged.enabled, true);
  });

  it("validateModerationSettings rejects notify without recipients", () => {
    assert.throws(
      () =>
        companyService.validateModerationSettings({
          enabled: true,
          notifyEnabled: true,
          notifyPhoneNumbers: [],
          notifyEmails: [],
          categories: [],
        }),
      /at least one notify recipient/i,
    );
  });

  it("validateModerationSettings accepts phone-only notify", () => {
    const result = companyService.validateModerationSettings({
      enabled: true,
      notifyEnabled: true,
      notifyPhoneNumbers: ["85212345678"],
      notifyEmails: [],
      categories: [
        {
          id: "custom",
          name: "Custom",
          enabled: true,
          phrases: ["badword"],
          inboxFolder: "slaRisk",
        },
      ],
    });
    assert.deepEqual(result.notifyPhoneNumbers, ["85212345678"]);
    assert.equal(result.categories[0]!.inboxFolder, "slaRisk");
  });

  it("validateModerationSettings accepts email-only notify", () => {
    const result = companyService.validateModerationSettings({
      enabled: true,
      notifyEnabled: true,
      notifyPhoneNumbers: [],
      notifyEmails: ["ops@example.com"],
      categories: [],
    });
    assert.deepEqual(result.notifyEmails, ["ops@example.com"]);
  });

  it("validateModerationSettings migrates legacy notifyPhoneNumber", () => {
    const result = companyService.validateModerationSettings({
      enabled: true,
      notifyEnabled: true,
      notifyPhoneNumber: "85212345678",
      categories: [],
    });
    assert.deepEqual(result.notifyPhoneNumbers, ["85212345678"]);
  });

  it("validateModerationSettings rejects invalid inbox folder via normalize fallback", () => {
    const result = companyService.validateModerationSettings({
      enabled: true,
      notifyEnabled: false,
      notifyPhoneNumbers: [],
      notifyEmails: [],
      categories: [
        {
          id: "x",
          name: "X",
          enabled: true,
          phrases: ["a"],
          inboxFolder: "invalid" as "attention",
        },
      ],
    });
    assert.equal(result.categories[0]!.inboxFolder, "attention");
  });
});
