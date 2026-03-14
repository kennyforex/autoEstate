import { Router, Request, Response } from "express";
import { Message, Conversation, Contact, Channel } from "../models/index.js";
import { getEvolutionClient } from "../config/evolution.js";

const router = Router();

/**
 * Fetch media by message ID using Evolution API
 * Evolution API decrypts WhatsApp media and returns it as base64
 */
router.get("/:messageId", async (req: Request, res: Response): Promise<void> => {
  const { messageId } = req.params;

  try {
    // Find the message
    const message = await Message.findById(messageId);
    if (!message || !message.evolutionMessageId) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    // Get the conversation to find the contact
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Get the contact to find the phone number (remoteJid)
    const contact = await Contact.findById(conversation.contactId);
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    // Get the channel to find the Evolution instance name
    const channel = await Channel.findById(message.channelId);
    if (!channel || !channel.evolutionInstanceName) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    // Construct the remoteJid - prefer whatsappId (LID) for LID contacts
    const senderId = contact.whatsappId || contact.phoneNumber;
    if (!senderId) {
      res.status(400).json({ error: "Contact has no phone number or WhatsApp ID" });
      return;
    }
    
    // If contact has whatsappId, it's a LID contact - use @lid suffix
    // Otherwise use @s.whatsapp.net for regular phone numbers
    const remoteJid = contact.whatsappId 
      ? `${contact.whatsappId}@lid`
      : `${senderId}@s.whatsapp.net`;

    // Use Evolution API to get the base64 media
    const evolutionClient = getEvolutionClient();
    const response = await evolutionClient.post(
      `/chat/getBase64FromMediaMessage/${channel.evolutionInstanceName}`,
      {
        message: {
          key: {
            remoteJid,
            fromMe: false,
            id: message.evolutionMessageId,
          },
        },
      }
    );

    const { base64, mimetype } = response.data;

    if (!base64) {
      res.status(404).json({ error: "Media not available" });
      return;
    }

    // Convert base64 to buffer and send
    const buffer = Buffer.from(base64, "base64");
    
    res.setHeader("Content-Type", mimetype || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    res.send(buffer);
  } catch (error) {
    console.error("Media fetch error:", error);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

export default router;
