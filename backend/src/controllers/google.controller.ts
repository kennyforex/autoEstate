import { Response } from 'express';
import type { AuthRequest } from '../types/index.js';
import { getAuthUrl, exchangeCodeForTokens, createOAuth2Client, SCOPES } from '../config/google.js';
import { GoogleConnection, encrypt } from '../models/GoogleConnection.js';
import { google } from 'googleapis';

export async function connect(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.query.token
    ? undefined // handled below
    : req.user?.userId;

  let resolvedUserId = userId;

  if (req.query.token) {
    const { verifyToken } = await import('../utils/jwt.js');
    try {
      const decoded = verifyToken(req.query.token as string);
      resolvedUserId = decoded.userId;
    } catch {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  }

  if (!resolvedUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const url = getAuthUrl(resolvedUserId);
  if (!url) {
    res.status(500).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
    return;
  }

  res.redirect(url);
}

export async function callback(req: AuthRequest, res: Response): Promise<void> {
  const { code, state: userId, error } = req.query;
  const appUrl = process.env.APP_URL || 'http://localhost:5173';

  if (error) {
    console.error('[Google] OAuth error:', error);
    res.redirect(`${appUrl}/integration?google=error&reason=${error}`);
    return;
  }

  if (!code || !userId) {
    res.redirect(`${appUrl}/integration?google=error&reason=missing_params`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code as string);

    if (!tokens.refresh_token) {
      console.error('[Google] No refresh token received — user may need to revoke and reconnect');
    }

    const client = createOAuth2Client()!;
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    await GoogleConnection.findOneAndUpdate(
      { userId },
      {
        userId,
        email: userInfo.email || 'unknown',
        accessTokenEnc: encrypt(tokens.access_token || ''),
        refreshTokenEnc: encrypt(tokens.refresh_token || ''),
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        scopes: SCOPES,
        connectedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    console.log(`[Google] Connected for user ${userId} (${userInfo.email})`);
    res.redirect(`${appUrl}/integration?google=connected`);
  } catch (err: any) {
    console.error('[Google] OAuth callback failed:', err.message);
    res.redirect(`${appUrl}/integration?google=error&reason=token_exchange_failed`);
  }
}

export async function status(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const connection = await GoogleConnection.findOne({ userId });
  if (!connection) {
    res.json({ connected: false });
    return;
  }

  res.json({
    connected: true,
    email: connection.email,
    scopes: connection.scopes,
    connectedAt: connection.connectedAt,
  });
}

export async function disconnect(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const connection = await GoogleConnection.findOneAndDelete({ userId });
  if (!connection) {
    res.status(404).json({ error: 'No Google connection found' });
    return;
  }

  console.log(`[Google] Disconnected for user ${userId}`);
  res.json({ success: true });
}
