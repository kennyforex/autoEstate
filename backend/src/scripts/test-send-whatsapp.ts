/**
 * Local tests for the send_whatsapp agent tool.
 *
 * Playground simulation (no MongoDB / Evolution required):
 *   cd backend && npx tsx src/scripts/test-send-whatsapp.ts --playground
 *
 * Live WhatsApp send (requires .env + real channel):
 *   SEND_WHATSAPP_CHANNEL_ID=<MongoDB Channel _id> \
 *   SEND_WHATSAPP_RECIPIENT=85261218051 \
 *   SEND_WHATSAPP_TEXT="Test from Foodflow script" \
 *   npx tsx src/scripts/test-send-whatsapp.ts --live
 *
 * Optional: SEND_WHATSAPP_MESSAGE_TYPE=image SEND_WHATSAPP_IMAGE_URL=https://...
 *
 * Validate channel/recipient only (no Evolution call):
 *   ...same env... npx tsx src/scripts/test-send-whatsapp.ts --dry-run
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { SendWhatsAppTool } from '../agent/tools/sendWhatsApp.tool.js';
import { Channel } from '../models/index.js';
import type { AgentContext } from '../agent/types.js';

function usage(): void {
  console.log(`
Usage:
  npx tsx src/scripts/test-send-whatsapp.ts --playground   (NO real WhatsApp — simulation only)
  npx tsx src/scripts/test-send-whatsapp.ts --list-channels  (print Channel _id for --live)
  npx tsx src/scripts/test-send-whatsapp.ts --dry-run
  npx tsx src/scripts/test-send-whatsapp.ts --live           (REAL send — use your own number)

Env (for --dry-run / --live):
  MONGODB_URI              MongoDB connection (default: mongodb://localhost:27017/ffcs)
  SEND_WHATSAPP_CHANNEL_ID Channel document _id (required for dry-run/live)
  SEND_WHATSAPP_RECIPIENT  E.164 digits, e.g. 85261218051 (required for dry-run/live)
  SEND_WHATSAPP_TEXT       Message body (default: test text with timestamp)
  SEND_WHATSAPP_MESSAGE_TYPE  text | image (default: text)
  SEND_WHATSAPP_IMAGE_URL  Required when message_type=image
  WHATSAPP_SEND_TOOL_ENABLED  Set false to test kill switch
`);
}

function playgroundContext(): AgentContext {
  return {
    conversationId: 'playground',
    assistantId: 'script-test-assistant',
    channelId: 'playground',
    source: 'playground',
    contact: { id: 'playground', name: 'Playground User' },
    assistant: {
      id: 'script-test-assistant',
      name: 'Script Test',
      primaryLanguage: 'en',
      tone: 'professional',
      model: 'stub',
      pineconeAssistantName: 'stub',
    },
    skills: [],
    messageHistory: [],
    activeSkillSlug: 'payment-collection',
  };
}

function liveContext(channelId: string): AgentContext {
  return {
    conversationId: 'script-test-conversation',
    assistantId: 'script-test-assistant',
    channelId,
    source: 'inbox',
    contact: { id: '507f1f77bcf86cd799439099', name: 'Script Sender Context' },
    assistant: {
      id: 'script-test-assistant',
      name: 'Script Test',
      primaryLanguage: 'en',
      tone: 'professional',
      model: 'stub',
      pineconeAssistantName: 'stub',
    },
    skills: [],
    messageHistory: [],
    activeSkillSlug: 'payment-collection',
  };
}

function toolArgsFromEnv(): Record<string, unknown> {
  const messageType = (process.env.SEND_WHATSAPP_MESSAGE_TYPE || 'text').trim();
  const recipient = (process.env.SEND_WHATSAPP_RECIPIENT || '').trim();
  const text =
    process.env.SEND_WHATSAPP_TEXT?.trim() ||
    `[Foodflow script test] ${new Date().toISOString()}`;
  const imageUrl = process.env.SEND_WHATSAPP_IMAGE_URL?.trim() || '';

  const args: Record<string, unknown> = {
    recipient,
    message_type: messageType,
    text,
  };
  if (messageType === 'image') {
    args.image_url = imageUrl;
  }
  return args;
}

async function runPlayground(): Promise<void> {
  const tool = new SendWhatsAppTool();
  const args = {
    recipient: process.env.SEND_WHATSAPP_RECIPIENT || '85261218051',
    message_type: 'text',
    text: process.env.SEND_WHATSAPP_TEXT || 'Playground simulation test',
  };
  const result = await tool.execute(args, playgroundContext());
  console.log('Result:', JSON.stringify(result, null, 2));
  if (!result.success) throw new Error(result.summary);
  const data = result.data as { simulated?: boolean } | null;
  if (!data?.simulated) {
    throw new Error('Expected simulated: true in playground mode');
  }
  console.log('');
  console.log('PASS playground — NO real WhatsApp was sent.');
  console.log('To message your phone, run --live with SEND_WHATSAPP_CHANNEL_ID (see --list-channels).');
}

async function runListChannels(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ffcs';
  await mongoose.connect(uri);
  try {
    const channels = await Channel.find({})
      .select('name evolutionInstanceName phoneNumber status')
      .lean();
    if (channels.length === 0) {
      console.log('No channels in database. Connect WhatsApp in the app first.');
      return;
    }
    console.log('Channels (use _id as SEND_WHATSAPP_CHANNEL_ID):\n');
    for (const ch of channels) {
      console.log(`  _id: ${ch._id}`);
      console.log(`  name: ${ch.name}`);
      console.log(`  evolutionInstanceName: ${ch.evolutionInstanceName ?? '(none)'}`);
      console.log(`  phoneNumber: ${ch.phoneNumber ?? '(none)'}`);
      console.log(`  status: ${(ch as { status?: string }).status ?? '—'}`);
      console.log('');
    }
  } finally {
    await mongoose.disconnect();
  }
}

async function loadChannel(channelId: string) {
  const channel = await Channel.findById(channelId).lean();
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }
  if (!channel.evolutionInstanceName) {
    throw new Error(
      `Channel ${channelId} has no evolutionInstanceName — connect WhatsApp in Channels UI.`,
    );
  }
  return channel;
}

async function runDryRun(): Promise<void> {
  const channelId = process.env.SEND_WHATSAPP_CHANNEL_ID?.trim();
  const recipient = process.env.SEND_WHATSAPP_RECIPIENT?.trim();
  if (!channelId || !recipient) {
    throw new Error('SEND_WHATSAPP_CHANNEL_ID and SEND_WHATSAPP_RECIPIENT are required.');
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ffcs';
  await mongoose.connect(uri);
  try {
    const channel = await loadChannel(channelId);
    const args = toolArgsFromEnv();
    console.log('Channel:', channel.name, '| instance:', channel.evolutionInstanceName);
    console.log('Would call send_whatsapp with:', JSON.stringify(args, null, 2));
    console.log('PASS dry-run — Evolution not called.');
  } finally {
    await mongoose.disconnect();
  }
}

async function runLive(): Promise<void> {
  const channelId = process.env.SEND_WHATSAPP_CHANNEL_ID?.trim();
  const recipient = process.env.SEND_WHATSAPP_RECIPIENT?.trim();
  if (!channelId || !recipient) {
    throw new Error('SEND_WHATSAPP_CHANNEL_ID and SEND_WHATSAPP_RECIPIENT are required.');
  }
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
    throw new Error('EVOLUTION_API_URL and EVOLUTION_API_KEY must be set in .env');
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ffcs';
  await mongoose.connect(uri);
  try {
    const channel = await loadChannel(channelId);
    const tool = new SendWhatsAppTool();
    const args = toolArgsFromEnv();
    console.log('Sending via channel:', channel.name, `(${channel.evolutionInstanceName})`);
    console.log('Args:', JSON.stringify(args, null, 2));

    const result = await tool.execute(args, liveContext(channelId));
    console.log('Result:', JSON.stringify(result, null, 2));
    if (!result.success) throw new Error(result.summary);
    console.log('PASS live — check the recipient phone and Inbox for the outbound message.');
  } finally {
    await mongoose.disconnect();
  }
}

async function main(): Promise<void> {
  const mode = process.argv.find((a) => a.startsWith('--')) || '';
  switch (mode) {
    case '--playground':
      await runPlayground();
      break;
    case '--list-channels':
      await runListChannels();
      break;
    case '--dry-run':
      await runDryRun();
      break;
    case '--live':
      await runLive();
      break;
    default:
      usage();
      process.exit(mode ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
