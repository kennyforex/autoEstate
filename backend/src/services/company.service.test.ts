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

  it("validateModerationSettings rejects notify without phone", () => {
    assert.throws(
      () =>
        companyService.validateModerationSettings({
          enabled: true,
          notifyEnabled: true,
          notifyPhoneNumber: "",
          categories: [],
        }),
      /Manager notify phone is required/,
    );
  });

  it("validateModerationSettings accepts valid payload", () => {
    const result = companyService.validateModerationSettings({
      enabled: true,
      notifyEnabled: true,
      notifyPhoneNumber: "85212345678",
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
    assert.equal(result.notifyPhoneNumber, "85212345678");
    assert.equal(result.categories[0]!.inboxFolder, "slaRisk");
  });

  it("validateModerationSettings rejects invalid inbox folder via normalize fallback", () => {
    const result = companyService.validateModerationSettings({
      enabled: true,
      notifyEnabled: false,
      notifyPhoneNumber: "",
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
