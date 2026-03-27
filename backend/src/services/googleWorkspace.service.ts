import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GoogleConnection, decrypt, encrypt } from '../models/GoogleConnection.js';
import { createOAuth2Client } from '../config/google.js';

class GoogleWorkspaceService {
  async getAuthedClient(userId: string): Promise<OAuth2Client> {
    const connection = await GoogleConnection.findOne({ userId });
    if (!connection) {
      throw new Error('GOOGLE_NOT_CONNECTED');
    }

    const client = createOAuth2Client();
    if (!client) {
      throw new Error('Google OAuth not configured on this server');
    }

    const accessToken = decrypt(connection.accessTokenEnc);
    const refreshToken = decrypt(connection.refreshTokenEnc);

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: connection.tokenExpiry?.getTime(),
    });

    client.on('tokens', async (tokens) => {
      const update: Record<string, unknown> = {};
      if (tokens.access_token) {
        update.accessTokenEnc = encrypt(tokens.access_token);
      }
      if (tokens.expiry_date) {
        update.tokenExpiry = new Date(tokens.expiry_date);
      }
      if (Object.keys(update).length > 0) {
        await GoogleConnection.updateOne({ userId }, { $set: update });
      }
    });

    return client;
  }

  // ── Gmail ──

  async sendEmail(userId: string, params: { to: string; subject: string; body: string }) {
    const auth = await this.getAuthedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=`;
    const message = [
      `To: ${params.to}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(params.body).toString('base64'),
    ].join('\n');

    const encodedMessage = Buffer.from(message).toString('base64url');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return { id: result.data.id, threadId: result.data.threadId };
  }

  async getInbox(userId: string, params: { query?: string; maxResults?: number } = {}) {
    const auth = await this.getAuthedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    const result = await gmail.users.messages.list({
      userId: 'me',
      q: params.query || 'is:inbox',
      maxResults: params.maxResults || 10,
    });

    if (!result.data.messages || result.data.messages.length === 0) {
      return [];
    }

    const messages = await Promise.all(
      result.data.messages.slice(0, 10).map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const headers = detail.data.payload?.headers || [];
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: headers.find((h) => h.name === 'From')?.value || '',
          subject: headers.find((h) => h.name === 'Subject')?.value || '',
          date: headers.find((h) => h.name === 'Date')?.value || '',
          snippet: detail.data.snippet || '',
        };
      }),
    );

    return messages;
  }

  async getMessage(userId: string, messageId: string) {
    const auth = await this.getAuthedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    const result = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = result.data.payload?.headers || [];
    let body = '';
    const parts = result.data.payload?.parts;
    if (parts) {
      const textPart = parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (result.data.payload?.body?.data) {
      body = Buffer.from(result.data.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: result.data.id,
      threadId: result.data.threadId,
      from: headers.find((h) => h.name === 'From')?.value || '',
      to: headers.find((h) => h.name === 'To')?.value || '',
      subject: headers.find((h) => h.name === 'Subject')?.value || '',
      date: headers.find((h) => h.name === 'Date')?.value || '',
      body,
      snippet: result.data.snippet || '',
    };
  }

  async replyToEmail(userId: string, params: { messageId: string; body: string }) {
    const auth = await this.getAuthedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    const original = await gmail.users.messages.get({
      userId: 'me',
      id: params.messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Message-ID'],
    });

    const headers = original.data.payload?.headers || [];
    const from = headers.find((h) => h.name === 'From')?.value || '';
    const subject = headers.find((h) => h.name === 'Subject')?.value || '';
    const messageIdHeader = headers.find((h) => h.name === 'Message-ID')?.value || '';

    const replySubject = `Re: ${subject.replace(/^Re:\s*/i, '')}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(replySubject).toString('base64')}?=`;
    const message = [
      `To: ${from}`,
      `Subject: ${encodedSubject}`,
      `In-Reply-To: ${messageIdHeader}`,
      `References: ${messageIdHeader}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(params.body).toString('base64'),
    ].join('\n');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: Buffer.from(message).toString('base64url'),
        threadId: original.data.threadId!,
      },
    });

    return { id: result.data.id, threadId: result.data.threadId };
  }

  // ── Calendar ──

  async getAgenda(userId: string, params: { timezone?: string } = {}) {
    const auth = await this.getAuthedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: params.timezone,
    });

    return (result.data.items || []).map((event) => ({
      id: event.id,
      summary: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
      attendees: event.attendees?.map((a) => a.email) || [],
      status: event.status,
      htmlLink: event.htmlLink,
    }));
  }

  async createEvent(userId: string, params: {
    summary: string;
    startTime: string;
    endTime: string;
    description?: string;
    location?: string;
    attendees?: string[];
  }) {
    const auth = await this.getAuthedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: { dateTime: params.startTime },
        end: { dateTime: params.endTime },
        attendees: params.attendees?.map((email) => ({ email })),
      },
    });

    return {
      id: result.data.id,
      summary: result.data.summary,
      start: result.data.start?.dateTime,
      end: result.data.end?.dateTime,
      htmlLink: result.data.htmlLink,
    };
  }

  async listEvents(userId: string, params: { timeMin?: string; timeMax?: string; maxResults?: number } = {}) {
    const auth = await this.getAuthedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: params.timeMin || new Date().toISOString(),
      timeMax: params.timeMax,
      maxResults: params.maxResults || 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (result.data.items || []).map((event) => ({
      id: event.id,
      summary: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
      attendees: event.attendees?.map((a) => a.email) || [],
      htmlLink: event.htmlLink,
    }));
  }

  async deleteEvent(userId: string, eventId: string) {
    const auth = await this.getAuthedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId: 'primary', eventId });
    return { deleted: true, eventId };
  }

  // ── Drive ──

  async listFiles(userId: string, params: { query?: string; pageSize?: number } = {}) {
    const auth = await this.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth });

    const result = await drive.files.list({
      q: params.query || undefined,
      pageSize: params.pageSize || 10,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, owners)',
      orderBy: 'modifiedTime desc',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    return (result.data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
    }));
  }

  async getFileInfo(userId: string, fileId: string) {
    const auth = await this.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth });

    const result = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, modifiedTime, webViewLink, owners, shared',
    });

    return result.data;
  }

  // ── Google Sheets (requires spreadsheets scope for create/write) ──

  async getSpreadsheetValues(userId: string, spreadsheetId: string, range: string) {
    const auth = await this.getAuthedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return result.data.values ?? [];
  }

  /**
   * Create a new Google Spreadsheet with a single sheet and populate rows (header + data).
   */
  async createSpreadsheetWithValues(
    userId: string,
    params: { title: string; sheetTitle?: string; rows: string[][] },
  ) {
    const auth = await this.getAuthedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    const sheetTitle = params.sheetTitle ?? 'Orders';
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: params.title },
        sheets: [
          {
            properties: {
              title: sheetTitle,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        ],
      },
    });

    const spreadsheetId = createRes.data.spreadsheetId!;
    const escaped = sheetTitle.replace(/'/g, "''");
    const range = `'${escaped}'!A1`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: params.rows },
    });

    return {
      spreadsheetId,
      spreadsheetUrl: createRes.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      title: params.title,
    };
  }

  /**
   * Append one or more rows to a sheet (e.g. order log). Range covers all columns to append.
   */
  async appendSpreadsheetRows(
    userId: string,
    params: { spreadsheetId: string; sheetName: string; rows: string[][]; lastColumnLetter?: string },
  ) {
    const auth = await this.getAuthedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });
    const col = params.lastColumnLetter ?? 'N';
    const escaped = params.sheetName.replace(/'/g, "''");
    const range = `'${escaped}'!A:${col}`;

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: params.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: params.rows },
    });

    return {
      updatedRange: result.data.updates?.updatedRange,
      updatedRows: result.data.updates?.updatedRows,
      spreadsheetId: params.spreadsheetId,
    };
  }

  async isConnected(userId: string): Promise<boolean> {
    const connection = await GoogleConnection.findOne({ userId });
    return !!connection;
  }
}

export const googleWorkspaceService = new GoogleWorkspaceService();
