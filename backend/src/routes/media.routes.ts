import { Router, Request, Response } from "express";
import { fetchDecryptedMediaByMessageId } from "../services/whatsappMedia.service.js";

const router = Router();

/**
 * Fetch media by message ID using Evolution API
 * Evolution API decrypts WhatsApp media and returns it as base64
 */
router.get("/:messageId", async (req: Request, res: Response): Promise<void> => {
  const { messageId } = req.params;

  try {
    const media = await fetchDecryptedMediaByMessageId(messageId, {
      logPrefix: "[MediaRoute]",
    });

    if (!media) {
      res.status(404).json({ error: "Media not available" });
      return;
    }

    res.setHeader("Content-Type", media.mimetype || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(media.buffer);
  } catch (error) {
    console.error("Media fetch error:", error);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

export default router;
