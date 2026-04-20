/**
 * Sync the repo copy of backend/skills/cake-booking/SKILL.md into an already-installed skill.
 *
 * Usage:
 *   npx tsx src/scripts/sync-cake-booking-skill.ts <skill-slug-or-id>
 */

import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { Skill } from "../models/Skill.js";
import { parseSkillFrontmatter } from "../services/skill.service.js";
import { skillMdBodyAfterFrontmatter } from "../utils/skillMdConfig.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/foodflow";

async function main() {
  const target = process.argv[2];
  if (!target) {
    throw new Error("Provide the installed skill slug or Mongo id to sync.");
  }

  await mongoose.connect(MONGODB_URI);

  const sourcePath = path.join(process.cwd(), "skills/cake-booking/SKILL.md");
  const sourceContent = await fs.readFile(sourcePath, "utf-8");
  const parsed = parseSkillFrontmatter(sourceContent);

  const skill =
    (await Skill.findOne({ slug: target })) ||
    (mongoose.isValidObjectId(target) ? await Skill.findById(target) : null);

  if (!skill) {
    throw new Error(`Installed skill not found for "${target}".`);
  }

  if (!skill.storagePath) {
    throw new Error(`Skill "${skill.slug}" has no storagePath; cannot sync SKILL.md.`);
  }

  await fs.writeFile(path.join(skill.storagePath, "SKILL.md"), sourceContent, "utf-8");

  skill.name = parsed.name;
  skill.description = parsed.description;
  skill.triggerHints = parsed.triggerHints;
  skill.steps = parsed.steps;
  skill.reminderDelay = parsed.reminderDelay;
  skill.maxReminders = parsed.maxReminders;
  skill.scheduleEnabled = parsed.scheduleEnabled;
  skill.scheduleCron = parsed.scheduleCron;
  skill.instructions = skillMdBodyAfterFrontmatter(sourceContent);
  if (parsed.toolConfigExplicit) {
    skill.requiredTools = parsed.requiredTools;
  }

  await skill.save();

  console.log(`Synced ${skill.slug} from repo cake-booking SKILL.md`);
  console.log(`storagePath: ${skill.storagePath}`);
  console.log(`requiredTools: ${skill.requiredTools.join(", ")}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
