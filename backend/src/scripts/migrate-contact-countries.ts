/**
 * Migration script to detect and set country codes for existing contacts
 * based on their phone numbers.
 * 
 * Run with: npx ts-node --esm src/scripts/migrate-contact-countries.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { parsePhoneNumber } from "libphonenumber-js";

// Load environment variables
config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcs";

async function detectCountryFromPhone(phoneNumber: string | undefined | null): Promise<string | undefined> {
  if (!phoneNumber) return undefined;
  
  try {
    // Ensure the phone number has a + prefix for international format
    const normalizedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const parsed = parsePhoneNumber(normalizedPhone);
    
    if (parsed && parsed.country) {
      return parsed.country;
    }
    
    return undefined;
  } catch {
    return undefined;
  }
}

async function migrateContacts(): Promise<void> {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection not established");
  }

  const contactsCollection = db.collection("contacts");

  // Find all contacts without a country field or with null/empty country
  const contactsToUpdate = await contactsCollection.find({
    $or: [
      { country: { $exists: false } },
      { country: null },
      { country: "" },
    ],
    phoneNumber: { $exists: true, $nin: [null, ""] },
  }).toArray();

  console.log(`Found ${contactsToUpdate.length} contacts to update`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const contact of contactsToUpdate) {
    try {
      const country = await detectCountryFromPhone(contact.phoneNumber);
      
      if (country) {
        await contactsCollection.updateOne(
          { _id: contact._id },
          { $set: { country } }
        );
        updated++;
        console.log(`Updated contact ${contact._id}: ${contact.phoneNumber} -> ${country}`);
      } else {
        skipped++;
        console.log(`Skipped contact ${contact._id}: Could not detect country from ${contact.phoneNumber}`);
      }
    } catch (error) {
      failed++;
      console.error(`Failed to update contact ${contact._id}:`, error);
    }
  }

  console.log("\n--- Migration Complete ---");
  console.log(`Total processed: ${contactsToUpdate.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no country detected): ${skipped}`);
  console.log(`Failed: ${failed}`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB");
}

// Run the migration
migrateContacts()
  .then(() => {
    console.log("Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
