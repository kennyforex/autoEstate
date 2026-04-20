import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

import { connectDatabase } from "./config/database.js";
import { initializeSocketHandlers } from "./socket/handlers.js";
import { errorHandler } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";
import { getUploadsRoot } from "./utils/uploadsPath.js";
import { initPaymentReminderScheduler } from "./services/paymentReminder.scheduler.js";
import { initSkillScheduleScheduler } from "./services/skillSchedule.scheduler.js";
import { initScheduledJobScheduler } from "./services/scheduledJob.scheduler.js";
import { initScheduledJobPlaygroundIo } from "./services/scheduledJobPlayground.js";
import { catalogService } from "./services/catalog.service.js";

import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "./types/index.js";

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Serve uploaded videos so DashScope can fetch them by URL (no auth for GET)
const uploadsDir = getUploadsRoot();
app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      // DashScope rejects video/x-m4v; serve .m4v as video/mp4 (same container)
      if (filePath.toLowerCase().endsWith(".m4v")) {
        res.setHeader("Content-Type", "video/mp4");
      }
    },
  }),
);

// CORS: allow dev origins when CORS_ORIGIN not set (3000 and 5173)
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"];

// Initialize Socket.IO
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

// Make io accessible to routes
app.set("io", io);

// Middleware
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" })); // Increased limit for base64 image uploads
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api", routes);

// Error handling middleware
app.use(errorHandler);

// Initialize socket handlers
initializeSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDatabase();
    await catalogService.initializeDefaults();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 WebSocket server ready`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📁 Uploads served from: ${uploadsDir} -> /uploads`);
      initPaymentReminderScheduler();
      initSkillScheduleScheduler(io);
      initScheduledJobPlaygroundIo(io);
      initScheduledJobScheduler();
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

export { app, io };
