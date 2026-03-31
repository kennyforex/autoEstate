/**
 * Backfill staff[] with a manager row and move existing assistant.skills onto that manager.
 * Idempotent: skips assistants that already have a manager in staff.
 * Run: npm run migrate:staff (from backend/)
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { Assistant } from "../models/index.js";
import { assistantService } from "../services/assistant.service.js";

config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcs";

async function migrate(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const assistants = await Assistant.find({});
  let updated = 0;
  for (const a of assistants) {
    const hasManager = a.staff?.some((s) => s.isManager);
    if (hasManager) {
      continue;
    }
    const display = (
      a.managerName ||
      a.departmentName ||
      a.name ||
      "Manager"
    ).trim();
    const skillIds = [...(a.skills || [])];
    if (!Array.isArray(a.staff)) {
      a.set("staff", []);
    }
    a.staff!.push({
      displayName: display,
      roleTitle: "",
      responsibilities: "",
      skillIds,
      isManager: true,
      nickname: a.managerNickname,
      avatarPreset: a.managerAvatarPreset,
      avatarUrl: a.managerAvatarUrl,
    } as never);
    assistantService.rebuildSkillsUnion(a);
    await a.save();
    updated++;
    console.log("Migrated assistant:", a._id.toString(), display);
  }
  console.log("Done. Migrated:", updated, "of", assistants.length);
  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
