import { Router, Response } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth.middleware.js";
import type { AuthRequest } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOAD_PATH || path.resolve(__dirname, "..", "..", "uploads");
const logosDir = path.join(uploadsDir, "logos");

const router = Router();

const mimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Upload base64 image: save to disk and return a normal URL.
 * Avoids huge payloads and data-URL display issues (e.g. logo).
 */
router.post(
  "/image",
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      console.log('📸 Image upload request received');
      console.log('User:', req.user?.email);
      console.log('Request body keys:', Object.keys(req.body));
      
      const { base64, mimeType } = req.body;

      if (!base64 || !mimeType) {
        console.error('❌ Missing required fields:', { hasBase64: !!base64, hasMimeType: !!mimeType });
        res.status(400).json({ error: "Missing base64 or mimeType" });
        return;
      }
      
      console.log('MimeType:', mimeType);
      console.log('Base64 length:', base64.length);

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (!allowedTypes.includes(mimeType)) {
        res.status(400).json({ error: "Invalid image type" });
        return;
      }

      const ext = mimeToExt[mimeType] || "png";
      const filename = `${randomUUID()}.${ext}`;
      fs.mkdirSync(logosDir, { recursive: true });
      const filePath = path.join(logosDir, filename);
      const buffer = Buffer.from(base64, "base64");
      fs.writeFileSync(filePath, buffer);

      const baseUrl =
        process.env.BACKEND_PUBLIC_URL ||
        process.env.WEBHOOK_BASE_URL ||
        `http://localhost:${process.env.PORT || 3001}`;
      const url = `${baseUrl.replace(/\/$/, "")}/uploads/logos/${filename}`;

      console.log('✅ Image uploaded successfully:', url);
      res.json({
        url,
        mimeType,
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  },
);

/**
 * Upload base64 file (any type) and return a data URL
 * Accepts all file types
 */
router.post(
  "/file",
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { base64, mimeType, fileName } = req.body;

      if (!base64 || !mimeType) {
        res.status(400).json({ error: "Missing base64 or mimeType" });
        return;
      }

      // Check file size (max 25MB - base64 is ~33% larger than binary)
      const maxBase64Size = 25 * 1024 * 1024 * 1.34;
      if (base64.length > maxBase64Size) {
        res
          .status(400)
          .json({ error: "File too large. Maximum size is 25MB." });
        return;
      }

      // Create data URL from base64
      const dataUrl = `data:${mimeType};base64,${base64}`;

      res.json({
        url: dataUrl,
        mimeType,
        fileName: fileName || "file",
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  },
);

export default router;
