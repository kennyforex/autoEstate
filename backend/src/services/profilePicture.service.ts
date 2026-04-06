import { getEvolutionClient } from "../config/evolution.js";
import { Contact, Channel } from "../models/index.js";

class ProfilePictureService {
  /**
   * Fetch profile picture URL from Evolution API v2
   * Tries multiple endpoint formats based on working implementation
   */
  async fetchProfilePictureUrl(
    instanceName: string,
    remoteJid: string
  ): Promise<string | null> {
    const evolutionClient = getEvolutionClient();
    
    // Strip the suffix for the API call
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
    
    // Try multiple endpoint formats
    const endpoints = [
      {
        method: 'POST' as const,
        url: `/chat/fetchProfilePictureUrl/${instanceName}`,
        payload: { number: remoteJid }
      },
      {
        method: 'POST' as const,
        url: `/chat/fetchProfilePictureUrl/${instanceName}`,
        payload: { number: phoneNumber }
      }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await evolutionClient.post(endpoint.url, endpoint.payload);

        // Try multiple response fields
        const profilePictureUrl = response.data?.profilePictureUrl || 
                                   response.data?.url || 
                                   response.data?.picture?.url ||
                                   response.data?.pictureUrl ||
                                   (typeof response.data === 'string' && response.data.startsWith('http') ? response.data : null);
        
        if (profilePictureUrl) {
          console.log(`[ProfilePicture] Fetched picture for ${remoteJid}: ${profilePictureUrl.substring(0, 50)}...`);
          return profilePictureUrl;
        }
      } catch (error: any) {
        // Continue to next endpoint on error
        if (error.response?.status !== 404) {
          console.log(`[ProfilePicture] Endpoint ${endpoint.url} failed: ${error.message}`);
        }
        continue;
      }
    }

    console.log(`[ProfilePicture] No profile picture available for ${remoteJid} (privacy settings may block access)`);
    return null;
  }

  /**
   * Fetch and update profile picture for a contact
   */
  async updateContactProfilePicture(
    contactId: string,
    channelId: string
  ): Promise<string | null> {
    try {
      const contact = await Contact.findById(contactId);
      if (!contact) {
        console.error(`[ProfilePicture] Contact not found: ${contactId}`);
        return null;
      }

      const channel = await Channel.findById(channelId);
      if (!channel || !channel.evolutionInstanceName) {
        console.error(`[ProfilePicture] Channel not found or no instance name: ${channelId}`);
        return null;
      }

      if (!contact.phoneNumber && !contact.whatsappId) {
        console.error(`[ProfilePicture] Contact has no phone number or WhatsApp ID`);
        return null;
      }

      let profilePictureUrl: string | null = null;

      // Try phone number first (more reliable for profile pictures)
      if (contact.phoneNumber) {
        const phoneJid = `${contact.phoneNumber}@s.whatsapp.net`;
        console.log(`[ProfilePicture] Trying phone number: ${phoneJid}`);
        profilePictureUrl = await this.fetchProfilePictureUrl(
          channel.evolutionInstanceName,
          phoneJid
        );
      }

      // If phone number didn't work and we have LID, try that
      if (!profilePictureUrl && contact.whatsappId) {
        const lidJid = `${contact.whatsappId}@lid`;
        console.log(`[ProfilePicture] Trying LID: ${lidJid}`);
        profilePictureUrl = await this.fetchProfilePictureUrl(
          channel.evolutionInstanceName,
          lidJid
        );
      }

      if (profilePictureUrl) {
        contact.avatar = profilePictureUrl;
        await contact.save();
        console.log(`[ProfilePicture] Updated avatar for contact ${contactId}`);
        return profilePictureUrl;
      }

      console.log(`[ProfilePicture] No profile picture found for contact ${contactId}`);
      return null;
    } catch (error) {
      console.error(`[ProfilePicture] Error updating contact profile picture:`, error);
      return null;
    }
  }

  /**
   * Fetch profile picture for a contact by their WhatsApp ID or phone number
   * Used for real-time fetching (e.g., when displaying a conversation)
   */
  async getProfilePictureForContact(
    instanceName: string,
    whatsappId?: string,
    phoneNumber?: string
  ): Promise<string | null> {
    if (!phoneNumber && !whatsappId) {
      return null;
    }

    let profilePictureUrl: string | null = null;

    // Try phone number first (more reliable for profile pictures)
    if (phoneNumber) {
      const phoneJid = `${phoneNumber}@s.whatsapp.net`;
      profilePictureUrl = await this.fetchProfilePictureUrl(instanceName, phoneJid);
    }

    // If phone number didn't work and we have LID, try that
    if (!profilePictureUrl && whatsappId) {
      const lidJid = `${whatsappId}@lid`;
      profilePictureUrl = await this.fetchProfilePictureUrl(instanceName, lidJid);
    }

    return profilePictureUrl;
  }

  /**
   * Batch update profile pictures for multiple contacts
   * Useful for refreshing profile pictures periodically
   */
  async batchUpdateProfilePictures(
    contactIds: string[],
    channelId: string
  ): Promise<void> {
    for (const contactId of contactIds) {
      try {
        await this.updateContactProfilePicture(contactId, channelId);
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[ProfilePicture] Failed to update picture for contact ${contactId}:`, error);
      }
    }
  }
}

export const profilePictureService = new ProfilePictureService();
