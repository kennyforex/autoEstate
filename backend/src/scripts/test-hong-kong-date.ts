import assert from "node:assert/strict";

import {
  buildHongKongDateFacts,
  formatHongKongDateOnly,
  normalizeHongKongDateTimeInput,
  parseHongKongDateMention,
  validateMinimumLeadDays,
} from "../utils/hongKongDate.js";

const fixedNow = new Date("2026-05-11T09:45:00.000Z"); // 2026-05-11 17:45 HKT

function runHongKongDateTests() {
  const may15 = parseHongKongDateMention("May 15", { now: fixedNow });
  assert.equal(may15.ok, true);
  assert.equal(may15.isoDate, "2026-05-15");
  assert.equal(may15.daysFromToday, 4);
  assert.equal(may15.relativeLabel, "in 4 days");

  const facts = buildHongKongDateFacts("May 15", { now: fixedNow });
  assert.match(facts, /May 15 -> 2026-05-15/);
  assert.match(facts, /4 days from today/);
  assert.doesNotMatch(facts, /tomorrow/i);

  for (const term of ["tomorrow", "tmr", "聽日", "明天"]) {
    const parsed = parseHongKongDateMention(term, { now: fixedNow });
    assert.equal(parsed.ok, true, `${term} should parse`);
    assert.equal(parsed.isoDate, "2026-05-12", `${term} should be May 12`);
    assert.equal(parsed.daysFromToday, 1);
    assert.equal(parsed.relativeLabel, "tomorrow");
  }

  const isoDate = parseHongKongDateMention("2026-05-15", { now: fixedNow });
  assert.equal(isoDate.ok, true);
  assert.equal(isoDate.isoDate, "2026-05-15");

  const tooSoon = validateMinimumLeadDays("2026-05-12", 2, { now: fixedNow });
  assert.equal(tooSoon.ok, false);
  assert.match(tooSoon.reason, /at least 2 days/i);

  const enoughLead = validateMinimumLeadDays("2026-05-15", 2, { now: fixedNow });
  assert.equal(enoughLead.ok, true);

  const invalid = parseHongKongDateMention("May 32", { now: fixedNow });
  assert.equal(invalid.ok, false);
  assert.match(invalid.reason, /invalid/i);

  assert.equal(formatHongKongDateOnly(new Date("2026-05-14T16:00:00.000Z")), "2026-05-15");
  assert.equal(
    normalizeHongKongDateTimeInput("2026-05-15", { defaultTime: "11:00" }),
    "2026-05-15T11:00:00+08:00",
  );
  assert.equal(
    normalizeHongKongDateTimeInput("2026-05-15T15:30:00+08:00"),
    "2026-05-15T15:30:00+08:00",
  );

  console.log("Hong Kong date checks passed.");
}

runHongKongDateTests();
