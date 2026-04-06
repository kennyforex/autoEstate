/**
 * Install hello-cron-test from backend/skills/hello-cron-test/SKILL.md
 *
 *   cd backend && npm run install:hello-cron-test-skill
 */

import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { skillService } from "../services/skill.service.js";
import { GoogleConnection } from "../models/GoogleConnection.js";
import { User } from "../models/User.js";
import { Skill } from "../models/Skill.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcs";

async function main() {
  await mongoose.connect(MONGODB_URI);
  const conn = await GoogleConnection.findOne();
  let uid = conn?.userId?.toString();
  if (!uid) {
    const first = await User.findOne().select("_id").lean();
    uid = first?._id?.toString();
  }
  if (!uid) {
    console.error("No user found. Sign up once or connect Google.");
    await mongoose.disconnect();
    process.exit(1);
  }
  const mdPath = path.join(process.cwd(), "skills/hello-cron-test/SKILL.md");
  const content = await fs.readFile(mdPath, "utf-8");
  const skill = await skillService.installFromMarkdown(content, uid);
  await Skill.updateOne(
    { slug: "hello-cron-test" },
    {
      $set: {
        scheduleEnabled: true,
        scheduleCron: "*/15 * * * * *",
      },
    },
  );
  console.log("Installed:", skill.slug, skill.storagePath);
  console.log(
    "Bind to an assistant, set PLAYGROUND_SCHEDULE_TEST_ASSISTANT_ID + SKILL_SCHEDULE_TEST_INTERVAL_MS=15000, SKILL_SCHEDULE_ENABLED=true",
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
