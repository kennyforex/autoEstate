/**
 * Cleanup job for orphaned video files in uploads/videos/
 *
 * Orphaned files are video files on disk that are no longer referenced by any
 * assistant file record (e.g. after assistant/file deletion or failed uploads).
 *
 * Usage:
 *   npx tsx src/scripts/cleanup-orphaned-videos.ts
 *
 * Optional: run via cron for periodic cleanup, e.g. weekly.
 */

import fs from "fs/promises";
import path from "path";
import { connectDatabase } from "../config/database.js";
import { videoConfig } from "../config/video.config.js";
import { Assistant } from "../models/index.js";

async function cleanupOrphanedVideos(): Promise<void> {
  const storageDir = path.isAbsolute(videoConfig.storage.directory)
    ? videoConfig.storage.directory
    : path.join(process.cwd(), videoConfig.storage.directory);

  try {
    const exists = await fs
      .access(storageDir)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      console.log("[cleanup-orphaned-videos] Directory does not exist:", storageDir);
      return;
    }

    const entries = await fs.readdir(storageDir, { withFileTypes: true });
    const filesOnDisk = entries
      .filter((e) => e.isFile())
      .map((e) => path.join(storageDir, e.name));

    if (filesOnDisk.length === 0) {
      console.log("[cleanup-orphaned-videos] No video files in directory");
      return;
    }

    const assistants = await Assistant.find({}).select("files").lean();
    const referencedPaths = new Set<string>();
    for (const a of assistants) {
      for (const f of a.files || []) {
        const file = f as { videoPath?: string };
        if (!file.videoPath) continue;
        const absolute = path.isAbsolute(file.videoPath)
          ? path.normalize(file.videoPath)
          : path.normalize(path.join(process.cwd(), file.videoPath));
        referencedPaths.add(absolute);
      }
    }

    let removed = 0;
    for (const filePath of filesOnDisk) {
      const normalized = path.normalize(filePath);
      if (referencedPaths.has(normalized)) continue;
      try {
        await fs.unlink(filePath);
        removed++;
        console.log("[cleanup-orphaned-videos] Removed:", filePath);
      } catch (err) {
        console.error("[cleanup-orphaned-videos] Failed to remove:", filePath, err);
      }
    }

    console.log(
      `[cleanup-orphaned-videos] Done. Removed ${removed} orphaned file(s), ${filesOnDisk.length - removed} kept.`,
    );
  } catch (err) {
    console.error("[cleanup-orphaned-videos] Error:", err);
    throw err;
  }
}

async function main(): Promise<void> {
  await connectDatabase();
  await cleanupOrphanedVideos();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
