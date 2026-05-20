import type { SkillToolCatalogEntry } from "./skillToolCatalog";

type SupportedToolLocale = "zh-CN" | "zh-TW";

const ZH_CN: Record<string, SkillToolCatalogEntry> = {
  contact_lookup: {
    description: "读取当前 WhatsApp 联系人的姓名、电话、电邮和公司等资料。",
    usage:
      "当技能需要个性化回复、确认当前对话对象身份，或检查联系人资料时使用。此工具只查询当前会话绑定的联系人，不能用来任意搜索电话号码。",
    parametersHelp:
      "• fields（必填）- 字段数组：name、phoneNumber、email、company，或使用 all 返回全部字段。",
    example: JSON.stringify({ fields: ["all"] }, null, 2),
  },

  conversation_history: {
    description: "读取当前对话最近的消息记录，包括客户、AI 和人工成员消息。",
    usage:
      "当用户提到之前说过的内容，或技能在回复前需要更多上下文时使用。除非真的需要长对话，否则建议使用较小的 limit。",
    parametersHelp:
      "• limit（可选）- 要读取的最近消息数量（默认 10，最多 30）。",
    example: JSON.stringify({ limit: 10 }, null, 2),
  },

  knowledge_base: {
    description: "在助手已上传并索引的知识库文件中进行语义搜索。",
    usage:
      "适合查询产品、服务、政策、价格、FAQ 或公司文件中的资料。当答案应来自公司知识库时，优先使用它而不是 web_search。",
    parametersHelp: "• query（必填）- 自然语言搜索问题。",
    example: JSON.stringify({ query: "营业时间是什么？" }, null, 2),
  },

  media_analysis: {
    description: "使用视觉或音频模型分析图片，或转录音频内容。",
    usage:
      "当用户发送图片或语音，而技能需要描述、识别内容或转录文字时使用。媒体必须已经是 base64 data URL 或公开 HTTPS URL。",
    parametersHelp:
      "• mediaType（必填）- image 或 audio。\n" +
      "• mediaDataUrl（必填）- 文件的 data: URL 或 https URL。\n" +
      "• prompt（可选）- 自定义分析指令。",
    example: JSON.stringify(
      {
        mediaType: "image",
        mediaDataUrl: "https://example.com/photo.jpg",
        prompt: "描述蛋糕设计，并读取图片上的文字。",
      },
      null,
      2,
    ),
  },

  document_data_capture: {
    description: "从图片或 PDF 中抽取结构化 JSON 数据。",
    usage:
      "适合处理发票、身份证明、表格、付款截图等需要机器可读字段的文件。requirements 应说明抽取规则，outputSchema 应定义需要的字段。",
    parametersHelp:
      "• documentType（必填）- image 或 pdf。\n" +
      "• sourceUrl（必填）- base64 data URL 或公开 HTTPS URL。\n" +
      "• requirements（必填）- 要抽取什么字段、格式、语言和规则。\n" +
      "• outputSchema（必填）- JSON 字符串，可为 OpenRouter json_schema 或内部 schema object。",
    example: JSON.stringify(
      {
        documentType: "image",
        sourceUrl: "https://example.com/receipt.jpg",
        requirements: "抽取商户、日期、总金额和货币。",
        outputSchema:
          '{"name":"receipt","strict":true,"schema":{"type":"object","properties":{"merchant":{"type":"string"},"total":{"type":"number"}},"required":["merchant","total"],"additionalProperties":false}}',
      },
      null,
      2,
    ),
  },

  google_calendar: {
    description: "管理已连接 Google Calendar 的日程、活动创建、查询、更新和删除。",
    usage:
      "适合预约、改期、查看可用时间或建立日历事件。需要管理员先在设置中连接 Google。",
    parametersHelp:
      "• action（必填）- agenda | create_event | list_events | update_event | delete_event。\n" +
      "• create_event：summary、startTime、endTime（ISO 8601）；可选 description、location、attendees、timezone。\n" +
      "• update_event / delete_event：eventId。\n" +
      "• list_events：可选 timeMin、timeMax、query。",
    example: JSON.stringify(
      {
        action: "create_event",
        summary: "蛋糕取货",
        startTime: "2026-05-20T14:00:00+08:00",
        endTime: "2026-05-20T14:30:00+08:00",
      },
      null,
      2,
    ),
  },

  google_gmail: {
    description: "在已连接的 Gmail 中发送、搜索、读取、回复或整理邮件。",
    usage:
      "当流程需要发送电邮给客户/同事，或需要查找邮箱内容时使用。需要管理员先连接 Google。",
    parametersHelp:
      "• action（必填）- send | search | read | reply | triage。\n" +
      "• send：to、subject、body。\n" +
      "• search / triage：query（Gmail 搜索语法），可选 maxResults。\n" +
      "• read / reply：messageId；reply 还需要 body。",
    example: JSON.stringify(
      {
        action: "send",
        to: "customer@example.com",
        subject: "订单确认",
        body: "感谢您的订单。",
      },
      null,
      2,
    ),
  },

  google_drive: {
    description: "在 Google Drive 中列出、搜索、查看文件信息，或上传文件。",
    usage:
      "适合保存收据/付款证明、按名称查找文件，或把公开 URL 的文件上传到 Drive。上传时若未提供 parentFolderId，可使用技能 YAML 中的 paymentPendingFolderId。",
    parametersHelp:
      "• action（必填）- list | search | info | upload。\n" +
      "• search：query（Drive 搜索语法）。\n" +
      "• info：fileId。\n" +
      "• upload：fileUrl、fileName；可选 parentFolderId、mimeType。",
    example: JSON.stringify(
      {
        action: "upload",
        fileUrl: "https://example.com/payment-proof.jpg",
        fileName: "Receipt-ORD-001.jpg",
      },
      null,
      2,
    ),
  },

  google_sheets: {
    description: "读取 Google Sheets 范围，或新增/更新订单、状态等表格行。",
    usage:
      "新订单只用 append_row 写入一次。付款或状态更新应使用 update_row 或 update_row_by_order_id，不要为同一个 Order ID 再新增第二行。",
    parametersHelp:
      "• action（必填）- append_row | read_range | update_row | update_row_by_order_id。\n" +
      "• spreadsheetId / sheetName - 若技能 SKILL.md 已设置 order_sheet_id、order_sheet_tab，可省略。\n" +
      "• append_row / update_*：data 对象，key 对应 sheetFields（如 Order ID、Customer、Status）。\n" +
      "• read_range：A1 范围，例如 Sheet1!A1:N10。\n" +
      "• update_row：matchValue，可选 matchColumnLetter（默认 A）。",
    example: JSON.stringify(
      {
        action: "append_row",
        data: {
          "Order ID": "ORD-001",
          Customer: "Jane Chan",
          Phone: "91234567",
          Status: "WAITING",
        },
      },
      null,
      2,
    ),
  },

  google_docs: {
    description: "创建或编辑 Google Docs，读取纯文本，或导出 PDF。",
    usage:
      "适合撰写信件、报告，或把已填写的文件导出成 PDF。表格式订单记录应优先使用 google_sheets。",
    parametersHelp:
      "• action（必填）- create | append_text | get_plain_text | export_pdf | export_pdf_to_drive。\n" +
      "• create：title。\n" +
      "• append_text / get_plain_text / export_*：documentId。\n" +
      "• append_text：text。\n" +
      "• export_pdf_to_drive：fileName、parentFolderId。",
    example: JSON.stringify(
      { action: "create", title: "订单摘要 - ORD-001" },
      null,
      2,
    ),
  },

  pdf_toolkit: {
    description: "对 PDF 执行文字抽取、合并、分页拆分、列出表单字段或填写表单字段。",
    usage:
      "适合处理服务器 uploads 路径或公开 URL 的 PDF。扫描版 PDF 可能没有可抽取文字；不支持绕过密码保护。",
    parametersHelp:
      "• action（必填）- extract_text | merge | split | list_form_fields | fill_form。\n" +
      "• source_url 或 uploads_path - 单个 PDF 来源。\n" +
      "• merge：merge_sources（HTTPS URL 数组，最多 10 个）。\n" +
      "• split：page_ranges，例如 \"0\" 或 \"0-2\"，页码从 0 开始。\n" +
      "• fill_form：field_values，字段名到字符串的映射。",
    example: JSON.stringify(
      { action: "extract_text", source_url: "https://example.com/form.pdf" },
      null,
      2,
    ),
  },

  office_files: {
    description: "读取/编辑本地 Excel，填充 Word 模板，或用 LibreOffice 转换 docx 为 PDF。",
    usage:
      "适合技能 assets/ 下的模板文件，例如报价单模板。需要多人云端协作时，应优先使用 google_sheets 或 google_docs。",
    parametersHelp:
      "• action（必填）- xlsx_read | xlsx_append_row | xlsx_set_cell | docx_fill_template | docx_to_pdf。\n" +
      "• source_url 或 uploads_path - 文件位置；技能中可使用 assets/...。\n" +
      "• xlsx_*：按需要提供 sheet_name、row_values、cell、cell_value。\n" +
      "• docx_fill_template：template_data_json（占位符到值），可选 output_docx_uploads_path。\n" +
      "• docx_to_pdf：output_pdf_uploads_path。",
    example: JSON.stringify(
      {
        action: "docx_fill_template",
        uploads_path: "assets/quotation-template.docx",
        template_data_json: '{"clientName":"Jane Chan","premium":"12000"}',
        output_docx_uploads_path: "quotations/q-001.docx",
      },
      null,
      2,
    ),
  },

  file_toolkit: {
    description: "读取 uploads/ 下的小型文本文件、查看文件元数据，或打包 zip。",
    usage:
      "适合读取 uploads/ 下的 txt/csv/json 等本地文件（路径必须相对 uploads，不能包含 ..）。不适用于 Google Drive 或 HTTP 抓取。",
    parametersHelp:
      "• action（必填）- read_text | metadata | zip_pack。\n" +
      "• read_text / metadata：uploads_path。\n" +
      "• zip_pack：uploads_paths（数组）、zip_output_path（例如 exports/bundle.zip）。",
    example: JSON.stringify(
      { action: "read_text", uploads_path: "skills/config.json" },
      null,
      2,
    ),
  },

  web_fetch_static: {
    description: "抓取公开 HTML 页面，并抽取正文或 CSS selector 指定片段（不执行 JavaScript）。",
    usage:
      "适合 allowlist 内的简单静态页面。若网站依赖 JavaScript 或需要互动，请使用 web_browser。",
    parametersHelp:
      "• url（必填）- 完整 https URL。\n" +
      "• selectors（可选）- label 到 CSS selector 的映射，用于抽取指定区域。\n" +
      "• max_chars（可选）- 抽取文本长度上限（默认 80000）。",
    example: JSON.stringify(
      { url: "https://example.com/menu", selectors: { prices: ".price-list" } },
      null,
      2,
    ),
  },

  web_browser: {
    description: "使用无头 Chromium 对 allowlist 网站执行多步骤浏览自动化。",
    usage:
      "当页面需要 JavaScript、点击、填表、截图或下载等互动时使用。同一个 assistant turn 会复用浏览器会话；需要服务器启用相关环境变量和 allowlist。",
    parametersHelp:
      "• action（必填）- navigate、get_text、screenshot、click、fill、type、press、download、wait_for_selector、wait_timeout、scroll、select_option 等。\n" +
      "• url - 用于 navigate 和多种动作。\n" +
      "• selector、text、key - 用于元素互动。\n" +
      "• timeout_ms / wait_ms - 有上限的等待时间。",
    example: JSON.stringify(
      { action: "navigate", url: "https://example.com/booking" },
      null,
      2,
    ),
  },

  web_search: {
    description: "通过 Brave Search API 搜索公开网页，获取实时或外部资讯。",
    usage:
      "当知识库没有答案，或用户询问当前事件、假期、第三方可用性等实时信息时使用。服务器需配置 BRAVE_SEARCH_API_KEY。",
    parametersHelp:
      "• query（必填）- 搜索关键词。\n" +
      "• maxResults（可选）- 返回结果数量（默认 5，最多 10）。",
    example: JSON.stringify(
      { query: "2026年5月香港公众假期" },
      null,
      2,
    ),
  },

  get_product_menu: {
    description: "获取当前联系人客户组的产品目录与有效价格。",
    usage:
      "在报价、介绍口味/尺寸/变体或计算总价前使用。提供 productId 与 selectedOptionValueIds 可返回报价。",
    parametersHelp:
      "• category（可选）— 分类筛选。\n• query（可选）— 搜索产品。\n• productId（可选）— 单个产品。\n• selectedOptionValueIds（可选）— 选项值 id。\n• includeInactive（可选）— 包含未上架产品。",
    example: JSON.stringify({ category: "Cake" }, null, 2),
  },

  get_shipping_options: {
    description: "列出已配置的配送方式及费用。",
    usage: "在报价运费或为 create_order 选择配送方式前使用。",
    parametersHelp: "• includeInactive（可选）— 包含未启用的配送方式。",
    example: JSON.stringify({ includeInactive: false }, null, 2),
  },

  create_order: {
    description: "在系统中创建内部订单（客户确认购买后落单）。",
    usage:
      "在菜单报价与配送明确后使用。价格或配送不明时先调用 get_product_menu、get_shipping_options。",
    parametersHelp:
      "• items（必填）— 行项目（snapshot.productName、quantity、unitPrice）。\n• shippingMethod、deliveryDate 等。",
    example: JSON.stringify(
      {
        items: [
          {
            snapshot: { productName: "芒果慕斯蛋糕" },
            quantity: 1,
            unitPrice: 380,
          },
        ],
        currency: "HKD",
      },
      null,
      2,
    ),
  },

  search_orders: {
    description: "按订单号、客户、状态或日期搜索内部订单。",
    usage: "用户询问既有订单、配送或付款状态时使用。",
    parametersHelp: "• search、status、paymentStatus、limit 等。",
    example: JSON.stringify({ search: "ORD-20260511", limit: 5 }, null, 2),
  },

  update_order_payment: {
    description: "附上付款凭证并将 paymentStatus 设为 verifying（须人工标为已付）。",
    usage: "document_data_capture 提取收据后使用。",
    parametersHelp:
      "• paymentStatus（必填）verifying。\n• receiptUrl（必填）— 客人訊息中的 Image URL。\n• messageId（建議）— 同一則訊息的 Message ID，用於保存可預覽收據。\n• orderId 或 orderNumber。",
    example: JSON.stringify(
      {
        orderNumber: "ORD-001",
        paymentStatus: "verifying",
        receiptUrl: "https://example.com/receipt.jpg",
      },
      null,
      2,
    ),
  },

  add_order_activity: {
    description: "为订单追加系统动态（訂單動態）。",
    usage: "记录技能步骤或审计备注，不修改订单字段。",
    parametersHelp: "• message（必填）。\n• orderId 或 orderNumber。",
    example: JSON.stringify(
      { orderNumber: "ORD-001", message: "已收到付款截图，待人工审核。" },
      null,
      2,
    ),
  },

  send_whatsapp: {
    description: "通过当前频道发送 WhatsApp 文字或图片。",
    usage: "技能需主动联络他人时使用。须在 required_tools 中启用。",
    parametersHelp:
      "• recipient（必填）。\n• message_type、text、image_url。",
    example: JSON.stringify(
      { recipient: "85291234567", message_type: "text", text: "您的蛋糕可以取货了。" },
      null,
      2,
    ),
  },
};

const ZH_TW: Record<string, SkillToolCatalogEntry> = {
  contact_lookup: {
    ...ZH_CN.contact_lookup,
    description: "讀取目前 WhatsApp 聯絡人的姓名、電話、電郵和公司等資料。",
    usage:
      "當技能需要個人化回覆、確認目前對話對象身份，或檢查聯絡人資料時使用。此工具只查詢目前會話綁定的聯絡人，不能用來任意搜尋電話號碼。",
    parametersHelp:
      "• fields（必填）- 欄位陣列：name、phoneNumber、email、company，或使用 all 返回全部欄位。",
  },

  google_drive: {
    ...ZH_CN.google_drive,
    description: "在 Google Drive 中列出、搜尋、查看檔案資訊，或上傳檔案。",
    usage:
      "適合保存收據/付款證明、按名稱尋找檔案，或把公開 URL 的檔案上傳到 Drive。上傳時若未提供 parentFolderId，可使用技能 YAML 中的 paymentPendingFolderId。",
    parametersHelp:
      "• action（必填）- list | search | info | upload。\n" +
      "• search：query（Drive 搜尋語法）。\n" +
      "• info：fileId。\n" +
      "• upload：fileUrl、fileName；可選 parentFolderId、mimeType。",
  },

  google_sheets: {
    ...ZH_CN.google_sheets,
    description: "讀取 Google Sheets 範圍，或新增/更新訂單、狀態等表格列。",
    usage:
      "新訂單只用 append_row 寫入一次。付款或狀態更新應使用 update_row 或 update_row_by_order_id，不要為同一個 Order ID 再新增第二列。",
    parametersHelp:
      "• action（必填）- append_row | read_range | update_row | update_row_by_order_id。\n" +
      "• spreadsheetId / sheetName - 若技能 SKILL.md 已設定 order_sheet_id、order_sheet_tab，可省略。\n" +
      "• append_row / update_*：data 物件，key 對應 sheetFields（如 Order ID、Customer、Status）。\n" +
      "• read_range：A1 範圍，例如 Sheet1!A1:N10。\n" +
      "• update_row：matchValue，可選 matchColumnLetter（預設 A）。",
  },

  get_product_menu: {
    description: "取得当前联系人客户组的产品目录与有效价格。",
    usage:
      "在报价、介绍口味/尺寸/变体或计算总价前使用。提供 productId 与 selectedOptionValueIds 可返回报价。",
    parametersHelp:
      "• category（可选）— 分类筛选。\n• query（可选）— 搜索产品。\n• productId（可选）— 单个产品。\n• selectedOptionValueIds（可选）— 选项值 id。\n• includeInactive（可选）— 包含未上架产品。",
    example: JSON.stringify({ category: "Cake" }, null, 2),
  },

  get_shipping_options: {
    description: "列出已配置的配送方式及费用。",
    usage: "在报价运费或为 create_order 选择配送方式前使用。",
    parametersHelp: "• includeInactive（可选）— 包含未启用的配送方式。",
    example: JSON.stringify({ includeInactive: false }, null, 2),
  },

  create_order: {
    description: "在系統中建立内部订单（客户确认购买后落单）。",
    usage:
      "在菜单报价与配送明确后使用。价格或配送不明时先调用 get_product_menu、get_shipping_options。",
    parametersHelp:
      "• items（必填）— 行项目（snapshot.productName、quantity、unitPrice）。\n• shippingMethod、deliveryDate 等。",
    example: JSON.stringify(
      {
        items: [
          {
            snapshot: { productName: "芒果慕斯蛋糕" },
            quantity: 1,
            unitPrice: 380,
          },
        ],
        currency: "HKD",
      },
      null,
      2,
    ),
  },

  search_orders: {
    description: "依訂單号、客户、状态或日期搜索内部订单。",
    usage: "用户询问既有订单、配送或付款状态时使用。",
    parametersHelp: "• search、status、paymentStatus、limit 等。",
    example: JSON.stringify({ search: "ORD-20260511", limit: 5 }, null, 2),
  },

  update_order_payment: {
    description: "附上付款凭证并将 paymentStatus 设为 verifying（须人工标为已付）。",
    usage: "document_data_capture 提取收据后使用。",
    parametersHelp:
      "• paymentStatus（必填）verifying。\n• receiptUrl（必填）— 客人訊息中的 Image URL。\n• messageId（建議）— 同一則訊息的 Message ID，用於保存可預覽收據。\n• orderId 或 orderNumber。",
    example: JSON.stringify(
      {
        orderNumber: "ORD-001",
        paymentStatus: "verifying",
        receiptUrl: "https://example.com/receipt.jpg",
      },
      null,
      2,
    ),
  },

  add_order_activity: {
    description: "為訂單追加系统动态（訂單動態）。",
    usage: "记录技能步骤或审计备注，不修改订单字段。",
    parametersHelp: "• message（必填）。\n• orderId 或 orderNumber。",
    example: JSON.stringify(
      { orderNumber: "ORD-001", message: "已收到付款截图，待人工审核。" },
      null,
      2,
    ),
  },

  send_whatsapp: {
    description: "透過目前频道发送 WhatsApp 文字或图片。",
    usage: "技能需主动联络他人时使用。须在 required_tools 中启用。",
    parametersHelp:
      "• recipient（必填）。\n• message_type、text、image_url。",
    example: JSON.stringify(
      { recipient: "85291234567", message_type: "text", text: "您的蛋糕可以取货了。" },
      null,
      2,
    ),
  },
};

export function getLocalizedSkillToolCatalogEntry(
  toolId: string,
  language: string,
): SkillToolCatalogEntry | undefined {
  const locale: SupportedToolLocale | undefined =
    language === "zh-CN" || language === "zh-TW" ? language : undefined;
  if (!locale) return undefined;
  const table = locale === "zh-CN" ? ZH_CN : ZH_TW;
  return table[toolId];
}
