import { getEvolutionClient, getWebhookBaseUrl } from "../config/evolution.js";
import {
  Channel,
  type IChannelDocument,
  type IAISettings,
} from "../models/index.js";
import { generateInstanceName } from "../utils/helpers.js";

export interface CreateChannelInput {
  name: string;
  phoneNumber?: string;
  assistantId?: string;
  aiSettings?: Partial<IAISettings>;
  businessProfile?: {
    name?: string;
    description?: string;
  };
  createdBy: string;
}

export interface UpdateChannelInput {
  name?: string;
  assistantId?: string | null;
  aiSettings?: Partial<IAISettings>;
  businessProfile?: {
    name?: string;
    description?: string;
    profilePicture?: string;
  };
}

class ChannelService {
  /**
   * Create a new WhatsApp channel
   */
  async create(input: CreateChannelInput): Promise<IChannelDocument> {
    const {
      name,
      phoneNumber,
      assistantId,
      aiSettings,
      businessProfile,
      createdBy,
    } = input;

    // Generate unique instance name for Evolution API
    const evolutionInstanceName = generateInstanceName(name);

    try {
      // Create instance in Evolution API
      const evolutionClient = getEvolutionClient();

      console.log(
        `🔧 Creating Evolution API instance: ${evolutionInstanceName}`,
      );
      await evolutionClient.post("/instance/create", {
        instanceName: evolutionInstanceName,
        token: phoneNumber, // Use phone as token for easy identification
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      });
      console.log(`✅ Instance created: ${evolutionInstanceName}`);

      // Set webhook for this instance (non-blocking - continue even if it fails)
      // Try v2 endpoint first, then fall back to v1
      try {
        const webhookUrl = `${getWebhookBaseUrl()}/api/webhooks/evolution/${evolutionInstanceName}`;

        // Try v2 endpoint format first
        try {
          await evolutionClient.post(
            `/webhook/instance/${evolutionInstanceName}`,
            {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: true,
              events: [
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "CONNECTION_UPDATE",
                "QRCODE_UPDATED",
              ],
            },
          );
          console.log(
            `✅ Webhook configured (v2) for ${evolutionInstanceName}`,
          );
        } catch (v2Error: unknown) {
          // If v2 fails with 404, try v1 endpoint
          const axiosError = v2Error as { response?: { status?: number } };
          if (axiosError.response?.status === 404) {
            console.log(`⚠️ v2 webhook endpoint not found, trying v1...`);
            await evolutionClient.post(
              `/webhook/set/${evolutionInstanceName}`,
              {
                webhook: {
                  enabled: true,
                  url: webhookUrl,
                  events: [
                    "MESSAGES_UPSERT",
                    "MESSAGES_UPDATE",
                    "CONNECTION_UPDATE",
                    "QRCODE_UPDATED",
                  ],
                },
              },
            );
            console.log(
              `✅ Webhook configured (v1) for ${evolutionInstanceName}`,
            );
          } else {
            throw v2Error;
          }
        }
      } catch (webhookError) {
        console.warn(
          `⚠️ Warning: Webhook setup failed for ${evolutionInstanceName}. Channel will still be created but won't receive real-time updates until webhook is configured.`,
        );
        // Continue with channel creation - webhook can be set up later
      }

      // Create channel in database
      const channel = new Channel({
        name,
        type: "whatsapp",
        evolutionInstanceName,
        status: "disconnected",
        phoneNumber, // Store the expected phone number
        assistantId,
        aiSettings: {
          enabled: aiSettings?.enabled ?? false,
          autoReplyMode: aiSettings?.autoReplyMode ?? "off",
          responseDelay: aiSettings?.responseDelay ?? 2,
          escalateOnNegativeSentiment:
            aiSettings?.escalateOnNegativeSentiment ?? true,
        },
        businessProfile: businessProfile || {},
        createdBy,
      });

      await channel.save();

      return channel;
    } catch (error) {
      console.error("Failed to create channel:", error);
      throw new Error("Failed to create WhatsApp channel");
    }
  }

  /**
   * Get all channels
   */
  async findAll(filters?: { createdBy?: string }): Promise<IChannelDocument[]> {
    const query: Record<string, unknown> = {};

    if (filters?.createdBy) {
      query.createdBy = filters.createdBy;
    }

    return Channel.find(query)
      .populate("assistantId", "name status")
      .sort({ createdAt: -1 });
  }

  /**
   * Get channel by ID
   */
  async findById(id: string): Promise<IChannelDocument | null> {
    return Channel.findById(id).populate("assistantId", "name status");
  }

  /**
   * Get channel by Evolution instance name
   */
  async findByInstanceName(
    instanceName: string,
  ): Promise<IChannelDocument | null> {
    return Channel.findOne({ evolutionInstanceName: instanceName });
  }

  /**
   * Update channel
   */
  async update(
    id: string,
    input: UpdateChannelInput,
  ): Promise<IChannelDocument | null> {
    const channel = await Channel.findById(id);
    if (!channel) {
      return null;
    }

    if (input.name) channel.name = input.name;
    if (input.assistantId !== undefined) {
      channel.assistantId = input.assistantId
        ? (input.assistantId as unknown as typeof channel.assistantId)
        : undefined;
    }
    if (input.aiSettings) {
      channel.aiSettings = { ...channel.aiSettings, ...input.aiSettings };
    }
    if (input.businessProfile) {
      channel.businessProfile = {
        ...channel.businessProfile,
        ...input.businessProfile,
      };
    }

    await channel.save();
    return channel;
  }

  /**
   * Update AI settings for channel
   */
  async updateAISettings(
    id: string,
    aiSettings: Partial<IAISettings>,
  ): Promise<IChannelDocument | null> {
    const channel = await Channel.findById(id);
    if (!channel) {
      return null;
    }

    channel.aiSettings = { ...channel.aiSettings, ...aiSettings };
    await channel.save();

    return channel;
  }

  /**
   * Delete channel
   */
  async delete(id: string): Promise<boolean> {
    const channel = await Channel.findById(id);
    if (!channel) {
      return false;
    }

    try {
      // Delete instance from Evolution API
      const evolutionClient = getEvolutionClient();
      await evolutionClient.delete(
        `/instance/delete/${channel.evolutionInstanceName}`,
      );
    } catch (error) {
      console.error("Failed to delete instance from Evolution API:", error);
      // Continue with DB deletion
    }

    await Channel.deleteOne({ _id: id });
    return true;
  }

  /**
   * Get QR code for connecting WhatsApp
   */
  async getQRCode(
    id: string,
  ): Promise<{ qrCode: string; status: string } | null> {
    const channel = await Channel.findById(id);
    if (!channel) {
      return null;
    }

    try {
      const evolutionClient = getEvolutionClient();

      // First check the connection state
      const stateResponse = await evolutionClient.get(
        `/instance/connectionState/${channel.evolutionInstanceName}`,
      );

      const state =
        stateResponse.data?.instance?.state || stateResponse.data?.state;

      // If already connected, no need for QR code
      if (state === "open") {
        channel.status = "connected";
        channel.qrCode = undefined;
        await channel.save();
        return { qrCode: "", status: "connected" };
      }

      // If instance is closed, try to restart it first
      if (state === "close") {
        console.log(
          `🔄 Instance ${channel.evolutionInstanceName} is closed, attempting restart...`,
        );
        try {
          await evolutionClient.post(
            `/instance/restart/${channel.evolutionInstanceName}`,
          );
          console.log(
            `✅ Instance restarted: ${channel.evolutionInstanceName}`,
          );
          // Wait a moment for the instance to restart
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (restartError) {
          console.log(
            `⚠️ Restart failed, will try connect anyway:`,
            restartError,
          );
        }
      }

      // Request connection (QR code)
      const connectResponse = await evolutionClient.get(
        `/instance/connect/${channel.evolutionInstanceName}`,
      );

      // Try multiple QR code extraction patterns (matching working project)
      let qrCode = null;
      if (connectResponse.data?.qrcode?.base64) {
        qrCode = connectResponse.data.qrcode.base64;
      } else if (connectResponse.data?.qrcode?.code) {
        const code = connectResponse.data.qrcode.code;
        qrCode = code.startsWith("data:")
          ? code
          : `data:image/png;base64,${code}`;
      } else if (connectResponse.data?.base64) {
        const code = connectResponse.data.base64;
        qrCode = code.startsWith("data:")
          ? code
          : `data:image/png;base64,${code}`;
      } else if (connectResponse.data?.code) {
        qrCode = connectResponse.data.code;
      }

      // Update channel with new QR code
      if (qrCode) {
        channel.qrCode = qrCode;
        channel.status = "connecting";
        await channel.save();
      }

      return {
        qrCode: qrCode || "",
        status: channel.status,
      };
    } catch (error) {
      console.error("Failed to get QR code:", error);
      throw new Error("Failed to get QR code");
    }
  }

  /**
   * Connect to WhatsApp (trigger QR code generation)
   */
  async connect(id: string): Promise<{ qrCode?: string; status: string }> {
    const channel = await Channel.findById(id);
    if (!channel) {
      throw new Error("Channel not found");
    }

    try {
      const evolutionClient = getEvolutionClient();

      // Check current connection state
      const stateResponse = await evolutionClient.get(
        `/instance/connectionState/${channel.evolutionInstanceName}`,
      );

      const state =
        stateResponse.data?.instance?.state || stateResponse.data?.state;

      if (state === "open") {
        channel.status = "connected";
        await channel.save();
        return { status: "connected" };
      }

      // Request new connection (QR code)
      const connectResponse = await evolutionClient.get(
        `/instance/connect/${channel.evolutionInstanceName}`,
      );

      // Try multiple QR code extraction patterns (matching working project)
      let qrCode = null;
      if (connectResponse.data?.qrcode?.base64) {
        qrCode = connectResponse.data.qrcode.base64;
      } else if (connectResponse.data?.qrcode?.code) {
        const code = connectResponse.data.qrcode.code;
        qrCode = code.startsWith("data:")
          ? code
          : `data:image/png;base64,${code}`;
      } else if (connectResponse.data?.base64) {
        const code = connectResponse.data.base64;
        qrCode = code.startsWith("data:")
          ? code
          : `data:image/png;base64,${code}`;
      } else if (connectResponse.data?.code) {
        qrCode = connectResponse.data.code;
      }

      channel.status = "connecting";
      if (qrCode) {
        channel.qrCode = qrCode;
      }
      await channel.save();

      return {
        qrCode,
        status: "connecting",
      };
    } catch (error) {
      console.error("Failed to connect:", error);
      throw new Error("Failed to connect to WhatsApp");
    }
  }

  /**
   * Check and update connection status by polling Evolution API
   * This is the key method for detecting successful QR scans
   */
  async checkConnectionStatus(
    id: string,
  ): Promise<{ status: string; phoneNumber?: string }> {
    const channel = await Channel.findById(id);
    if (!channel) {
      throw new Error("Channel not found");
    }

    try {
      const evolutionClient = getEvolutionClient();

      const stateResponse = await evolutionClient.get(
        `/instance/connectionState/${channel.evolutionInstanceName}`,
      );

      // Map Evolution API state to our status
      // Evolution API returns { instance: { state: "open" } } or similar
      const state =
        stateResponse.data?.instance?.state || stateResponse.data?.state;

      let newStatus: "connected" | "disconnected" | "connecting" =
        "disconnected";
      if (state === "open") {
        newStatus = "connected";
      } else if (state === "connecting") {
        newStatus = "connecting";
      } else if (state === "close") {
        newStatus = "disconnected";
      }

      // Update channel if status changed
      if (channel.status !== newStatus) {
        console.log(
          `✅ Channel status changed: ${channel.status} -> ${newStatus}`,
        );
        channel.status = newStatus;

        if (newStatus === "connected") {
          channel.qrCode = undefined; // Clear QR code once connected
        }

        await channel.save();
      }

      return {
        status: newStatus,
        phoneNumber: channel.phoneNumber,
      };
    } catch (error) {
      console.error("Failed to check connection status:", error);
      // Return current cached status on error
      return { status: channel.status, phoneNumber: channel.phoneNumber };
    }
  }

  /**
   * Disconnect WhatsApp
   */
  async disconnect(id: string): Promise<boolean> {
    const channel = await Channel.findById(id);
    if (!channel) {
      return false;
    }

    try {
      const evolutionClient = getEvolutionClient();
      await evolutionClient.delete(
        `/instance/logout/${channel.evolutionInstanceName}`,
      );

      channel.status = "disconnected";
      channel.qrCode = undefined;
      channel.phoneNumber = undefined;
      await channel.save();

      return true;
    } catch (error) {
      console.error("Failed to disconnect:", error);
      throw new Error("Failed to disconnect from WhatsApp");
    }
  }

  /**
   * Update connection status (called by webhook)
   */
  async updateConnectionStatus(
    instanceName: string,
    status: "connected" | "disconnected" | "connecting",
    phoneNumber?: string,
  ): Promise<IChannelDocument | null> {
    const channel = await Channel.findOne({
      evolutionInstanceName: instanceName,
    });
    if (!channel) {
      return null;
    }

    channel.status = status;
    if (phoneNumber) {
      channel.phoneNumber = phoneNumber;
    }
    if (status === "connected") {
      channel.qrCode = undefined;
    }

    await channel.save();
    return channel;
  }

  /**
   * Update QR code (called by webhook)
   */
  async updateQRCode(
    instanceName: string,
    qrCode: string,
  ): Promise<IChannelDocument | null> {
    const channel = await Channel.findOne({
      evolutionInstanceName: instanceName,
    });
    if (!channel) {
      return null;
    }

    channel.qrCode = qrCode;
    channel.status = "connecting";
    await channel.save();

    return channel;
  }
}

export const channelService = new ChannelService();
