export interface SkillToolCatalogEntry {
  description: string;
  usage: string;
  parametersHelp: string;
  example: string;
}

export const SKILL_TOOL_CATALOG: Record<string, SkillToolCatalogEntry> = {
  contact_lookup: {
    description:
      'Look up the current WhatsApp contact’s details (name, phone, email, company) from the active conversation.',
    usage:
      'Use when you need to personalise a reply or confirm who you are speaking with. ' +
      'Only returns the contact tied to this conversation — not arbitrary phone lookups.',
    parametersHelp:
      '• fields (required) — array of field names: name, phoneNumber, email, company, or all to return every field.',
    example: JSON.stringify({ fields: ['all'] }, null, 2),
  },

  conversation_history: {
    description:
      'Retrieve recent messages from the current conversation (customer, AI, and agent roles).',
    usage:
      'Use when the user refers to something said earlier, or you need more context before answering. ' +
      'Prefer a small limit unless you truly need a long thread.',
    parametersHelp:
      '• limit (optional) — number of recent messages to fetch (default 10, max 30).',
    example: JSON.stringify({ limit: 10 }, null, 2),
  },

  knowledge_base: {
    description:
      'Semantic search over the assistant’s uploaded knowledge base (PDFs, docs, indexed content).',
    usage:
      'Use for product info, policies, pricing, FAQs, or anything stored in the KB. ' +
      'Prefer this over web_search when the answer should come from company documents.',
    parametersHelp: '• query (required) — natural-language search question.',
    example: JSON.stringify({ query: 'What are your opening hours?' }, null, 2),
  },

  media_analysis: {
    description:
      'Analyze an image with a vision model or transcribe audio using an audio-capable model.',
    usage:
      'Use when the user sends an image or voice note and you need a description or transcript. ' +
      'The media must already be available as a base64 data URL or public HTTPS URL.',
    parametersHelp:
      '• mediaType (required) — image or audio.\n' +
      '• mediaDataUrl (required) — data: URL or https URL of the file.\n' +
      '• prompt (optional) — custom instruction for the analysis.',
    example: JSON.stringify(
      {
        mediaType: 'image',
        mediaDataUrl: 'https://example.com/photo.jpg',
        prompt: 'Describe the cake design and any text on the image.',
      },
      null,
      2,
    ),
  },

  document_data_capture: {
    description:
      'Extract structured JSON from an image or PDF using a vision model and a strict output schema.',
    usage:
      'Use for invoices, IDs, forms, or payment screenshots when you need machine-readable fields. ' +
      'Define outputSchema to match the fields you need; requirements should describe extraction rules.',
    parametersHelp:
      '• documentType (required) — image or pdf.\n' +
      '• sourceUrl (required) — base64 data URL or public HTTPS URL.\n' +
      '• requirements (required) — what to extract (field names, formats, language).\n' +
      '• outputSchema (required) — JSON string: OpenRouter json_schema shape or inner schema object.',
    example: JSON.stringify(
      {
        documentType: 'image',
        sourceUrl: 'https://example.com/receipt.jpg',
        requirements: 'Extract merchant, date, total amount, and currency.',
        outputSchema:
          '{"name":"receipt","strict":true,"schema":{"type":"object","properties":{"merchant":{"type":"string"},"total":{"type":"number"}},"required":["merchant","total"],"additionalProperties":false}}',
      },
      null,
      2,
    ),
  },

  google_calendar: {
    description:
      'View agenda, create, list, update, or delete events on the connected Google Calendar.',
    usage:
      'Use for booking, rescheduling, or checking availability. Requires Google connected in Settings > Connected Apps.',
    parametersHelp:
      '• action (required) — agenda | create_event | list_events | update_event | delete_event.\n' +
      '• create_event: summary, startTime, endTime (ISO 8601); optional description, location, attendees, timezone.\n' +
      '• update_event / delete_event: eventId.\n' +
      '• list_events: optional timeMin, timeMax, query.',
    example: JSON.stringify(
      {
        action: 'create_event',
        summary: 'Cake pickup',
        startTime: '2026-05-20T14:00:00+08:00',
        endTime: '2026-05-20T14:30:00+08:00',
      },
      null,
      2,
    ),
  },

  google_gmail: {
    description: 'Send, search, read, reply to, or triage messages in the connected Gmail account.',
    usage:
      'Use to email staff or customers when the workflow needs outbound mail or inbox lookup. ' +
      'Requires Google connected in Settings.',
    parametersHelp:
      '• action (required) — send | search | read | reply | triage.\n' +
      '• send: to, subject, body.\n' +
      '• search / triage: query (Gmail syntax), optional maxResults.\n' +
      '• read / reply: messageId; reply also needs body.',
    example: JSON.stringify(
      {
        action: 'send',
        to: 'customer@example.com',
        subject: 'Your order confirmation',
        body: 'Thank you for your order.',
      },
      null,
      2,
    ),
  },

  google_drive: {
    description:
      'List, search, inspect, or upload files to Google Drive (e.g. payment proof folders).',
    usage:
      'Use to archive receipts, find files by name, or upload from a URL. ' +
      'For uploads, parentFolderId can come from skill YAML paymentPendingFolderId if omitted.',
    parametersHelp:
      '• action (required) — list | search | info | upload.\n' +
      '• search: query (Drive search syntax).\n' +
      '• info: fileId.\n' +
      '• upload: fileUrl, fileName; optional parentFolderId, mimeType.',
    example: JSON.stringify(
      {
        action: 'upload',
        fileUrl: 'https://example.com/payment-proof.jpg',
        fileName: 'Receipt-ORD-001.jpg',
      },
      null,
      2,
    ),
  },

  google_sheets: {
    description:
      'Append or update rows, or read ranges from Google Sheets (order logs, status columns).',
    usage:
      'Use append_row once per new order. For payment or status updates on an existing order, use update_row or update_row_by_order_id — do not append a second row for the same Order ID.',
    parametersHelp:
      '• action (required) — append_row | read_range | update_row | update_row_by_order_id.\n' +
      '• spreadsheetId / sheetName — optional if set in skill SKILL.md (order_sheet_id, order_sheet_tab).\n' +
      '• append_row / update_*: data object keyed by sheetFields (e.g. Order ID, Customer, Status).\n' +
      '• read_range: range (A1 notation, e.g. Sheet1!A1:N10).\n' +
      '• update_row: matchValue, optional matchColumnLetter (default A).',
    example: JSON.stringify(
      {
        action: 'append_row',
        data: {
          'Order ID': 'ORD-001',
          Customer: 'Jane Chan',
          Phone: '91234567',
          Status: 'WAITING',
        },
      },
      null,
      2,
    ),
  },

  google_docs: {
    description:
      'Create or edit Google Docs, read plain text, or export a Doc as PDF (optionally to Drive).',
    usage:
      'Use for drafting letters or reports in Docs, or exporting a filled document as PDF. Prefer google_sheets for tabular order logs.',
    parametersHelp:
      '• action (required) — create | append_text | get_plain_text | export_pdf | export_pdf_to_drive.\n' +
      '• create: title.\n' +
      '• append_text / get_plain_text / export_*: documentId.\n' +
      '• append_text: text.\n' +
      '• export_pdf_to_drive: fileName, parentFolderId.',
    example: JSON.stringify(
      { action: 'create', title: 'Order summary — ORD-001' },
      null,
      2,
    ),
  },

  pdf_toolkit: {
    description:
      'Extract text, merge, split, list form fields, or fill AcroForm fields on PDFs from URL or uploads path.',
    usage:
      'Use for PDFs stored on the server or at a public URL. Scanned PDFs may return little text; password-protected PDFs are not supported.',
    parametersHelp:
      '• action (required) — extract_text | merge | split | list_form_fields | fill_form.\n' +
      '• source_url or uploads_path — single PDF source.\n' +
      '• merge: merge_sources (array of HTTPS URLs, max 10).\n' +
      '• split: page_ranges (e.g. "0" or "0-2", 0-based).\n' +
      '• fill_form: field_values map of field name → string.',
    example: JSON.stringify(
      { action: 'extract_text', source_url: 'https://example.com/form.pdf' },
      null,
      2,
    ),
  },

  office_files: {
    description:
      'Read/edit local Excel (.xlsx), fill Word (.docx) templates, or convert docx to PDF via LibreOffice.',
    usage:
      'Use for skill assets under assets/ (e.g. quotation templates) during execute_skill. ' +
      'For cloud collaboration prefer google_sheets / google_docs.',
    parametersHelp:
      '• action (required) — xlsx_read | xlsx_append_row | xlsx_set_cell | docx_fill_template | docx_to_pdf.\n' +
      '• source_url or uploads_path — file location (assets/... allowed in skills).\n' +
      '• xlsx_*: sheet_name, row_values, cell, cell_value as needed.\n' +
      '• docx_fill_template: template_data_json (placeholder → value), optional output_docx_uploads_path.\n' +
      '• docx_to_pdf: output_pdf_uploads_path.',
    example: JSON.stringify(
      {
        action: 'docx_fill_template',
        uploads_path: 'assets/quotation-template.docx',
        template_data_json: '{"clientName":"Jane Chan","total":"12000"}',
        output_docx_uploads_path: 'quotations/q-001.docx',
      },
      null,
      2,
    ),
  },

  file_toolkit: {
    description:
      'Read small text files, get metadata, or zip multiple files under server uploads/.',
    usage:
      'Use for local text/CSV/JSON under uploads/ (paths relative to uploads, no ..). Not for Google Drive or HTTP fetch.',
    parametersHelp:
      '• action (required) — read_text | metadata | zip_pack.\n' +
      '• read_text / metadata: uploads_path.\n' +
      '• zip_pack: uploads_paths (array), zip_output_path (e.g. exports/bundle.zip).',
    example: JSON.stringify(
      { action: 'read_text', uploads_path: 'skills/config.json' },
      null,
      2,
    ),
  },

  web_fetch_static: {
    description:
      'Fetch a public HTML page and extract body text or CSS-selected fragments (no JavaScript).',
    usage:
      'Use for simple static pages on allowlisted origins (WEB_FETCH_ALLOWLIST_ORIGINS). ' +
      'For JS-heavy sites use web_browser instead.',
    parametersHelp:
      '• url (required) — full https URL.\n' +
      '• selectors (optional) — map of label → CSS selector for targeted text.\n' +
      '• max_chars (optional) — cap on extracted text (default 80000).',
    example: JSON.stringify(
      { url: 'https://example.com/menu', selectors: { prices: '.price-list' } },
      null,
      2,
    ),
  },

  web_browser: {
    description:
      'Headless Chromium (Playwright) for multi-step browsing on allowlisted sites (navigate, click, screenshot).',
    usage:
      'Use when a page needs JavaScript or interaction. Same browser session is reused per assistant turn. ' +
      'Requires ENABLE_WEB_FETCH_BROWSER and allowlisted origins; interactions need WEB_BROWSER_ALLOW_INTERACTION.',
    parametersHelp:
      '• action (required) — navigate, get_text, screenshot, click, fill, type, press, download, wait_for_selector, wait_timeout, scroll, select_option, etc.\n' +
      '• url — for navigate and many actions.\n' +
      '• selector, text, key — for element interactions.\n' +
      '• timeout_ms / wait_ms — bounded waits.',
    example: JSON.stringify(
      { action: 'navigate', url: 'https://example.com/booking' },
      null,
      2,
    ),
  },

  web_search: {
    description:
      'Search the public web via Brave Search API for live or external information.',
    usage:
      'Use when the KB lacks an answer, or the user asks about current events, holidays, or third-party availability. ' +
      'Requires BRAVE_SEARCH_API_KEY on the server.',
    parametersHelp:
      '• query (required) — search query string.\n' +
      '• maxResults (optional) — number of results (default 5, max 10).',
    example: JSON.stringify({ query: 'Hong Kong public holiday May 2026' }, null, 2),
  },

  get_product_menu: {
    description:
      'Fetch the structured product catalog and effective prices for the current contact’s client group.',
    usage:
      'Use before quoting menu prices, flavours, sizes, variants, or a final total. ' +
      'Combine productId with selectedOptionValueIds to get a calculated quote.',
    parametersHelp:
      '• category (optional) — filter by category, e.g. Cake or Drinks.\n' +
      '• query (optional) — search product name or description.\n' +
      '• productId (optional) — single product; with selectedOptionValueIds returns a total.\n' +
      '• selectedOptionValueIds (optional) — array of option value ids for pricing.\n' +
      '• includeInactive (optional) — include inactive products (default false).',
    example: JSON.stringify(
      { category: 'Cake', query: 'mango' },
      null,
      2,
    ),
  },

  get_shipping_options: {
    description: 'List configured shipping methods and their fees.',
    usage:
      'Use before quoting delivery fees or choosing shippingMethodId / shippingMethod for create_order.',
    parametersHelp:
      '• includeInactive (optional) — include inactive methods (default false).',
    example: JSON.stringify({ includeInactive: false }, null, 2),
  },

  create_order: {
    description:
      'Create an internal order in MongoDB when the customer confirms a purchase.',
    usage:
      'Use after menu quote and shipping are clear. contactId defaults to the current conversation contact. ' +
      'Call get_product_menu and get_shipping_options first when prices or delivery are unknown.',
    parametersHelp:
      '• items (required) — line items with snapshot (productName required), quantity, unitPrice.\n' +
      '• contactId, clientName, phoneNumber, email, shippingAddress — customer overrides.\n' +
      '• shippingMethodId or shippingMethod, deliveryDate (ISO-8601).\n' +
      '• status, paymentStatus, fulfillmentStatus, currency, discountTotal, shippingFee, taxTotal, tagIds.',
    example: JSON.stringify(
      {
        items: [
          {
            snapshot: { productName: 'Mango Mousse Cake', variantLabel: '6 inch' },
            quantity: 1,
            unitPrice: 380,
          },
        ],
        shippingMethod: 'Store pickup',
        currency: 'HKD',
      },
      null,
      2,
    ),
  },

  search_orders: {
    description:
      'Search internal orders by order number, customer fields, status, payment/fulfillment state, tags, or date ranges.',
    usage:
      'Use when the user asks about an existing order, delivery status, or payment state. ' +
      'Prefer orderNumber from the customer when known.',
    parametersHelp:
      '• search (optional) — order number or customer text.\n' +
      '• status, paymentStatus, fulfillmentStatus, tagId.\n' +
      '• createdFrom / createdTo, deliveryFrom / deliveryTo (ISO-8601).\n' +
      '• limit (default 10, max 50), offset, sortBy, sortOrder.',
    example: JSON.stringify(
      { search: 'ORD-20260511', limit: 5 },
      null,
      2,
    ),
  },

  update_order_payment: {
    description:
      'Attach a payment receipt to an order and set paymentStatus to verifying (staff mark paid in UI).',
    usage:
      'Use after document_data_capture extracts receipt fields. Never marks an order paid automatically.',
    parametersHelp:
      '• paymentStatus (required) — must be verifying.\n' +
      '• receiptUrl (required) — image/PDF URL from the customer or Drive.\n' +
      '• orderId or orderNumber (one required).\n' +
      '• receiptFileName, extracted (object from capture), reviewNotes (optional).',
    example: JSON.stringify(
      {
        orderNumber: 'ORD-20260511-TNGYKN',
        paymentStatus: 'verifying',
        receiptUrl: 'https://example.com/receipt.jpg',
        extracted: { amount: 380, currency: 'HKD' },
      },
      null,
      2,
    ),
  },

  add_order_activity: {
    description:
      'Append a system activity entry to an order (visible in order activity / 訂單動態).',
    usage:
      'Use to log skill milestones, receipt steps, or audit notes without changing order fields.',
    parametersHelp:
      '• message (required) — text shown in the activity log.\n' +
      '• orderId or orderNumber (one required).',
    example: JSON.stringify(
      {
        orderNumber: 'ORD-20260511-TNGYKN',
        message: 'Payment receipt received; awaiting staff review.',
      },
      null,
      2,
    ),
  },

  send_whatsapp: {
    description:
      'Send a WhatsApp text or image on the current channel to a phone number or WhatsApp ID.',
    usage:
      'Use when a skill must proactively message someone (payment chase, notify staff). ' +
      'Recipient needs country code for phone numbers. Must be enabled in required_tools.',
    parametersHelp:
      '• recipient (required) — E.164 digits or …@lid.\n' +
      '• message_type (optional) — text (default) or image.\n' +
      '• text — body for text or caption for image.\n' +
      '• image_url — required when message_type is image.',
    example: JSON.stringify(
      {
        recipient: '85291234567',
        message_type: 'text',
        text: 'Your cake order is ready for pickup.',
      },
      null,
      2,
    ),
  },
};

export function getSkillToolCatalogEntry(
  toolId: string,
): SkillToolCatalogEntry | undefined {
  return SKILL_TOOL_CATALOG[toolId];
}
