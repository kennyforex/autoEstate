import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Company } from "../models/index.js";
import { sendModerationAlertEmail } from "./email.service.js";

describe("email.service moderation alerts", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("sendModerationAlertEmail returns false when SMTP not configured", async () => {
    mock.method(Company, "findOne", () => ({
      select: async () => ({}),
    }));

    const sent = await sendModerationAlertEmail(
      "manager@example.com",
      "alert body",
    );
    assert.equal(sent, false);
  });
});
