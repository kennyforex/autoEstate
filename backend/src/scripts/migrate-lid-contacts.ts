/**
 * Migration script to move WhatsApp LIDs from phoneNumber to whatsappId field
 * 
 * LIDs (Linked IDs) are WhatsApp's privacy feature that provides a numeric identifier
 * instead of the actual phone number. LIDs are typically 14+ digits long, while
 * phone numbers are usually 10-13 digits.
 * 
 * This script:
 * 1. Finds all contacts where phoneNumber is 14+ digits (likely LIDs)
 * 2. Moves the value from phoneNumber to whatsappId
 * 3. Sets phoneNumber to null
 * 
 * Usage:
 *   npx tsx src/scripts/migrate-lid-contacts.ts
 * 
 * Or add to package.json scripts:
 *   "migrate:lid": "tsx src/scripts/migrate-lid-contacts.ts"
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Define contact schema inline to avoid import issues
const contactSchema = new mongoose.Schema({
  phoneNumber: String,
  whatsappId: String,
  name: String,
  email: String,
  company: String,
  avatar: String,
  channelId: mongoose.Schema.Types.ObjectId,
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const Contact = mongoose.model("Contact", contactSchema);

async function migrate(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcs";
  
  console.log("🔗 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB");

  try {
    // Find all contacts where phoneNumber exists and is 14+ digits (likely LIDs)
    const contacts = await Contact.find({
      phoneNumber: { $exists: true, $ne: null },
    });

    console.log(`📊 Found ${contacts.length} total contacts`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const contact of contacts) {
      const phoneNumber = contact.phoneNumber as string;
      
      // Skip if no phoneNumber or already has whatsappId
      if (!phoneNumber || contact.whatsappId) {
        skippedCount++;
        continue;
      }

      // Clean the phone number to check length
      const cleanNumber = phoneNumber.replace(/\D/g, "");
      
      // If 14+ digits, it's likely a LID
      if (cleanNumber.length >= 14) {
        console.log(`  🔄 Migrating contact ${contact._id}: ${phoneNumber} -> whatsappId`);
        
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: { whatsappId: cleanNumber },
            $unset: { phoneNumber: "" }
          }
        );
        
        migratedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log("");
    console.log("📈 Migration Summary:");
    console.log(`   ✅ Migrated: ${migratedCount} contacts (LIDs moved to whatsappId)`);
    console.log(`   ⏭️  Skipped: ${skippedCount} contacts (valid phone numbers or already migrated)`);
    console.log("");
    console.log("✨ Migration completed successfully!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

// Run the migration
migrate().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
