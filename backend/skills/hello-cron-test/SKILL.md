---
name: hello-cron-test
description: >-
  Test skill for scheduled Playground socket pushes (no LLM on each tick).
  Use when developing or verifying scheduler behaviour; bind to an assistant and enable schedule
  in Basic settings, or use env SKILL_SCHEDULE_TEST_INTERVAL_MS with PLAYGROUND_SCHEDULE_TEST_ASSISTANT_ID.
argument-hint: "[none — dev only]"
user-invocable: false
metadata:
  display_name: Hello Cron Test
  version: 1.0.0
  category: internal
  trigger_hints:
    - hello cron
    - scheduled test
  schedule_enabled: true
  schedule_cron: "*/15 * * * * *"
  reminder_delay: 0
  max_reminders: 0
steps: []
---

# Hello Cron Test

This skill exists so the database can store **scheduleEnabled** / **scheduleCron** for development.

When the server runs with `SKILL_SCHEDULE_ENABLED=true` and either:

- `SKILL_SCHEDULE_TEST_INTERVAL_MS` + `PLAYGROUND_SCHEDULE_TEST_ASSISTANT_ID`, or
- this skill **scheduleEnabled** with assistants that have the skill bound,

the backend pushes a short message to the Playground over Socket.IO (no agent run each tick).
