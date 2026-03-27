import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-change-me';

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'google-oauth-salt', 32);
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', deriveKey(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', deriveKey(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface IGoogleConnectionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  tokenExpiry: Date;
  scopes: string[];
  connectedAt: Date;
}

const googleConnectionSchema = new Schema<IGoogleConnectionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
    },
    accessTokenEnc: {
      type: String,
      required: true,
    },
    refreshTokenEnc: {
      type: String,
      required: true,
    },
    tokenExpiry: {
      type: Date,
    },
    scopes: {
      type: [String],
      default: [],
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

googleConnectionSchema.set('toJSON', {
  transform(_doc: any, ret: any) {
    delete ret.accessTokenEnc;
    delete ret.refreshTokenEnc;
    return ret;
  },
});

export const GoogleConnection = mongoose.model<IGoogleConnectionDocument>(
  'GoogleConnection',
  googleConnectionSchema,
);

export { encrypt, decrypt };
