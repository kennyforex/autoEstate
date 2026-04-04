---
name: Hello Cron Test
slug: hello-cron-test
description: Test skill for scheduled Playground socket pushes (no LLM on tick). Bind to an assistant and enable schedule in Basic settings or use env SKILL_SCHEDULE_TEST_INTERVAL_MS.
triggerHints: hello cron, scheduled test
scheduleEnabled: true
scheduleCron: '*/15 * * * * *'
---

# Hello Cron Test

This skill exists so the database can store **scheduleEnabled** / **scheduleCron** for development.

When the server runs with `SKILL_SCHEDULE_ENABLED=true` and either:

- `SKILL_SCHEDULE_TEST_INTERVAL_MS` + `PLAYGROUND_SCHEDULE_TEST_ASSISTANT_ID`, or
- this skill **scheduleEnabled** with assistants that have the skill bound,

the backend pushes a short message to the Playground over Socket.IO (no agent run each tick).
