/**
 * Backfill departmentName and managerName from legacy `name` when missing.
 * Run: npm run migrate:department (from backend/)
 */
import mongoose from "mongoose";
import { config } from "dotenv";

config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcs";

async function migrate(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const col = mongoose.connection.collection("assistants");
  const res = await col.updateMany(
    {},
    [
      {
        $set: {
          departmentName: { $ifNull: ["$departmentName", "$name"] },
          managerName: { $ifNull: ["$managerName", "$name"] },
        },
      },
    ],
  );
  console.log("Matched:", res.matchedCount, "Modified:", res.modifiedCount);
  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
