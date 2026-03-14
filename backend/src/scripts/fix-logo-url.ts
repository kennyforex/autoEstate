/**
 * Script to fix logo URLs in the database
 * Converts ngrok URLs to localhost URLs for local development
 */
import { connectDatabase } from "../config/database.js";
import { Company } from "../models/index.js";

async function fixLogoUrl() {
  try {
    await connectDatabase();
    console.log("✅ Connected to MongoDB");

    const company = await Company.findOne();
    if (!company) {
      console.log("ℹ️  No company found in database");
      process.exit(0);
    }

    if (!company.logo) {
      console.log("ℹ️  No logo URL found in company profile");
      process.exit(0);
    }

    console.log(`Current logo URL: ${company.logo}`);

    // Check if logo URL contains ngrok or other non-localhost URL
    if (company.logo.includes("ngrok") || 
        (company.logo.startsWith("http") && !company.logo.includes("localhost"))) {
      
      // Extract the filename from the URL
      const match = company.logo.match(/\/uploads\/logos\/([^/]+)$/);
      if (match) {
        const filename = match[1];
        const newUrl = `http://localhost:3001/uploads/logos/${filename}`;
        
        company.logo = newUrl;
        await company.save();
        
        console.log(`✅ Updated logo URL to: ${newUrl}`);
      } else {
        console.log("⚠️  Could not extract filename from logo URL");
      }
    } else {
      console.log("ℹ️  Logo URL already points to localhost or is relative");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error fixing logo URL:", error);
    process.exit(1);
  }
}

fixLogoUrl();
