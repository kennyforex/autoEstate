/**
 * Register 追收款項 skill from backend/skills/payment-collection/SKILL.md
 *
 *   cd backend && npx tsx src/scripts/install-payment-collection-skill.ts
 *
 * Then assign the skill to an assistant in the UI. Ensure the same user has Google OAuth
 * as for other Sheet-based skills.
 */

import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { skillService } from "../services/skill.service.js";
import { GoogleConnection } from "../models/GoogleConnection.js";
import { Skill } from "../models/Skill.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcs";

async function main() {
  await mongoose.connect(MONGODB_URI);
  const conn = await GoogleConnection.findOne();
  if (!conn) {
    console.error("No GoogleConnection — connect Google in the app first.");
    await mongoose.disconnect();
    process.exit(1);
  }
  const userId = conn.userId.toString();
  const mdPath = path.join(process.cwd(), "skills/payment-collection/SKILL.md");
  const content = await fs.readFile(mdPath, "utf-8");
  const skill = await skillService.installFromMarkdown(content, userId);
  await Skill.updateOne(
    { slug: "payment-collection" },
    {
      $set: {
        requiredTools: ["google_sheets"],
      },
    },
  );
  console.log("Installed skill:", skill.slug, skill.name, "\nstoragePath:", skill.storagePath);
  console.log("Assign `payment-collection` to an assistant in the UI.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
