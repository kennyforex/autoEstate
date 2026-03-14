import { Router, Request, Response } from "express";
import { Contact, Channel } from "../models/index.js";
import { profilePictureService } from "../services/profilePicture.service.js";

const router = Router();

/**
 * Get all contacts with message stats
 * Supports pagination, search, and server-side sorting
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { 
    channelId, 
    search, 
    limit = "50", 
    offset = "0",
    sortBy = "lastChatDate",
    sortOrder = "desc"
  } = req.query;

  try {
    const mongoose = await import("mongoose");
    const matchStage: Record<string, unknown> = {};
    
    if (channelId) {
      matchStage.channelId = new mongoose.default.Types.ObjectId(channelId as string);
    }
    
    // Use text search if available, fallback to regex for short queries
    // Text search is faster but requires at least 3 characters for meaningful results
    const searchTerm = (search as string)?.trim();
    if (searchTerm) {
      if (searchTerm.length >= 2) {
        // Use $text search with the text index for better performance
        // But also include regex fallback for partial phone number matching
        matchStage.$or = [
          { $text: { $search: searchTerm } },
          // Regex for phone numbers (prefix match is faster)
          { phoneNumber: { $regex: `^${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: "i" } },
          { phoneNumber: { $regex: searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: "i" } },
        ];
      } else {
        // For very short queries, use regex (less efficient but more flexible)
        const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        matchStage.$or = [
          { name: { $regex: escapedSearch, $options: "i" } },
          { email: { $regex: escapedSearch, $options: "i" } },
          { phoneNumber: { $regex: escapedSearch, $options: "i" } },
          { company: { $regex: escapedSearch, $options: "i" } },
        ];
      }
    }

    // Build sort stage based on parameters
    const validSortFields = ["name", "createdAt", "lastChatDate", "messageCount"];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : "lastChatDate";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const pipeline: Record<string, unknown>[] = [
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      // Lookup conversations to get last message date
      {
        $lookup: {
          from: "conversations",
          localField: "_id",
          foreignField: "contactId",
          as: "conversations",
        },
      },
      // Lookup channel info
      {
        $lookup: {
          from: "channels",
          localField: "channelId",
          foreignField: "_id",
          as: "channel",
        },
      },
      // Unwind channel (single value)
      {
        $unwind: {
          path: "$channel",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Add computed fields
      {
        $addFields: {
          conversationCount: { $size: "$conversations" },
          lastChatDate: { $max: "$conversations.lastMessageAt" },
          channelName: "$channel.name",
          totalUnread: { $sum: "$conversations.unreadCount" },
        },
      },
      // Lookup messages to count them - use a more efficient approach
      {
        $lookup: {
          from: "messages",
          let: { convIds: "$conversations._id" },
          pipeline: [
            { $match: { $expr: { $in: ["$conversationId", "$$convIds"] } } },
            { $count: "count" },
          ],
          as: "messageStats",
        },
      },
      // Add message count
      {
        $addFields: {
          messageCount: {
            $ifNull: [{ $arrayElemAt: ["$messageStats.count", 0] }, 0],
          },
        },
      },
      // Project final fields (remove large arrays to reduce memory)
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phoneNumber: 1,
          whatsappId: 1,
          company: 1,
          avatar: 1,
          country: 1,
          channelId: 1,
          channelName: 1,
          messageCount: 1,
          conversationCount: 1,
          lastChatDate: 1,
          totalUnread: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      // Server-side sorting
      { $sort: { [sortField as string]: sortDirection, createdAt: -1 } },
    ];

    // Get total count efficiently (only apply match stage)
    const countPipeline = [
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      { $count: "total" },
    ];
    const countResult = await Contact.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Add pagination
    const parsedOffset = Math.max(0, parseInt(offset as string, 10) || 0);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    pipeline.push({ $skip: parsedOffset });
    pipeline.push({ $limit: parsedLimit });

    const contacts = await Contact.aggregate(pipeline);

    res.json({
      contacts,
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error("Contacts fetch error:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

/**
 * Get profile picture for a contact
 * This fetches the profile picture from WhatsApp if not cached
 */
router.get("/:contactId/profile-picture", async (req: Request, res: Response): Promise<void> => {
  const { contactId } = req.params;
  const { refresh } = req.query; // Optional: force refresh from WhatsApp

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    // If we have a cached avatar and no refresh requested, return it
    if (contact.avatar && refresh !== "true") {
      res.json({ 
        profilePictureUrl: contact.avatar,
        cached: true 
      });
      return;
    }

    // Get the channel to find the Evolution instance
    const channel = await Channel.findById(contact.channelId);
    if (!channel || !channel.evolutionInstanceName) {
      res.status(400).json({ error: "Channel not configured" });
      return;
    }

    // Fetch fresh profile picture from WhatsApp
    const profilePictureUrl = await profilePictureService.getProfilePictureForContact(
      channel.evolutionInstanceName,
      contact.whatsappId,
      contact.phoneNumber
    );

    if (profilePictureUrl) {
      // Cache the URL in the contact record
      contact.avatar = profilePictureUrl;
      await contact.save();

      res.json({ 
        profilePictureUrl,
        cached: false 
      });
    } else {
      res.json({ 
        profilePictureUrl: null,
        cached: false 
      });
    }
  } catch (error) {
    console.error("Profile picture fetch error:", error);
    res.status(500).json({ error: "Failed to fetch profile picture" });
  }
});

/**
 * Force refresh profile picture for a contact
 */
router.post("/:contactId/refresh-profile-picture", async (req: Request, res: Response): Promise<void> => {
  const { contactId } = req.params;

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const profilePictureUrl = await profilePictureService.updateContactProfilePicture(
      contactId,
      contact.channelId.toString()
    );

    res.json({ 
      success: true,
      profilePictureUrl,
      contact: {
        _id: contact._id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        whatsappId: contact.whatsappId,
        avatar: profilePictureUrl || contact.avatar
      }
    });
  } catch (error) {
    console.error("Profile picture refresh error:", error);
    res.status(500).json({ error: "Failed to refresh profile picture" });
  }
});

/**
 * Refresh profile pictures for all contacts in a channel
 */
router.post("/refresh-profile-pictures", async (req: Request, res: Response): Promise<void> => {
  const { channelId } = req.body;

  if (!channelId) {
    res.status(400).json({ error: "channelId is required" });
    return;
  }

  try {
    const contacts = await Contact.find({ channelId });
    const contactIds = contacts.map(c => c._id.toString());

    // Start batch update in background
    profilePictureService.batchUpdateProfilePictures(contactIds, channelId)
      .catch(err => console.error("Batch profile picture update failed:", err));

    res.json({ 
      message: "Profile picture refresh started",
      contactCount: contactIds.length 
    });
  } catch (error) {
    console.error("Profile picture refresh error:", error);
    res.status(500).json({ error: "Failed to start profile picture refresh" });
  }
});

/**
 * Get contact details including profile picture
 */
router.get("/:contactId", async (req: Request, res: Response): Promise<void> => {
  const { contactId } = req.params;

  try {
    const contact = await Contact.findById(contactId).populate("channelId");
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    res.json(contact);
  } catch (error) {
    console.error("Contact fetch error:", error);
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

/**
 * Update contact details
 */
router.patch("/:contactId", async (req: Request, res: Response): Promise<void> => {
  const { contactId } = req.params;
  const updates = req.body;

  try {
    const contact = await Contact.findByIdAndUpdate(
      contactId,
      { $set: updates },
      { new: true }
    );
    
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    res.json(contact);
  } catch (error) {
    console.error("Contact update error:", error);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

export default router;
