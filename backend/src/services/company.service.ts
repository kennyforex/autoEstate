import { Company, type ICompanyDocument } from "../models/index.js";

class CompanyService {
  /**
   * Get the company profile (creates a default one if none exists).
   * Any authenticated user (admin or not) receives the full profile including logo.
   */
  async getCompany(): Promise<ICompanyDocument> {
    let company = await Company.findOne();

    if (!company) {
      company = new Company({
        name: "My Company",
        timezone: "UTC",
      });
      await company.save();
    }

    return company;
  }

  /**
   * Update the company profile (including SMTP for invite emails)
   */
  async updateCompany(
    updates: Partial<
      Pick<
        ICompanyDocument,
        | "name"
        | "logo"
        | "email"
        | "phone"
        | "address"
        | "website"
        | "timezone"
        | "smtpHost"
        | "smtpPort"
        | "smtpUser"
        | "smtpPass"
        | "emailFrom"
        | "appUrl"
      >
    >,
  ): Promise<ICompanyDocument | null> {
    let company = await Company.findOne();
    
    if (!company) {
      // Create a new company with the provided updates
      company = new Company({
        name: updates.name || "My Company",
        ...updates,
      });
      await company.save();
      return company;
    }
    
    // Update existing company
    Object.assign(company, updates);
    await company.save();
    return company;
  }
}

export const companyService = new CompanyService();
