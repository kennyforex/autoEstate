---
name: payment-collection
description: >-
  Looks up unpaid orders in the Google Sheet and reminds the customer to pay.
  Use when the customer asks about payment status, balance, deposit, 尾款, FPS, bank transfer,
  or staff need to chase payment for an order.
argument-hint: "[order id or phone if known]"
user-invocable: true
metadata:
  display_name: 追收款項
  version: 1.0.0
  category: payments
  language: zh-HK + English
  reminder_delay: 30
  max_reminders: 2
  trigger_hints:
    - 追收
    - 收款
    - 未付款
    - 尾款
    - 訂金
    - unpaid
    - payment due
    - balance
    - deposit
    - pay order
    - 付款
    - 轉數快
    - FPS
  order_sheet_id: 1kh8YbUIrrUAXed2qHfSmY600kUPH_akqkYMSYdDFu4Y
  order_sheet_tab: Cake orders
  sheet_fields:
    - Order ID
    - Order Date
    - Customer
    - Phone
    - Item
    - Flavour
    - Size
    - Qty
    - Birthday Plate
    - Pickup Date
    - Pickup Time
    - Pickup Method
    - Delivery Address
    - Notes
    - Status
    - Price (HKD)
    - Payment Status
    - Payment Amount
    - Paid Date
    - Payment Valid
    - Receipt
  required_tools:
    - google_sheets
    - send_whatsapp
steps:
  - id: lookup
    label: 用試算表查詢此客戶未付款訂單
    collects: unpaid_orders
  - id: remind
    label: 告知金額與禮貌提醒付款方式
    collects: payment_ack
---

## 資料契約（與訂單 skill 同一張表）

- **付款狀態**欄：`Payment Status`。視為「未付」的值須與店內試算表一致（例如：`未付`、`Pending` 等）；**已付**則不要催款。
- **電話**欄：`Phone` — 比對目前對話聯絡人的電話（可含國碼；系統會寬鬆比對）。
- **訂單編號**欄：`Order ID` — 回覆客戶時應引用。
- 可選：在試算表新增 **Last Payment Reminder** 欄供人手記錄（後台排程 job 預設用資料庫去重，不必填此欄）。

## 行為

1. 使用 **google_sheets** `read_range` 讀取訂單表（範圍須涵蓋標題列與資料列，例如 `Cake orders!A1:U20`）。工具回傳內會包含 **Raw rows** 以及 **Rows mapped to skill sheetFields**；你必須依後者逐欄引用真實儲存格值（Order ID、Phone、Payment Status、Price (HKD) 等）。**禁止**說「無法看到試算表」「需從試算表確認」等——有對應欄位就照抄回覆。
2. 找出 **Payment Status** 為未付且 **Phone** 與當前客戶（或客戶提供的號碼）相符的列。
3. 若客戶提供訂單編號，可優先篩選該 **Order ID**。
4. 用清晰、有禮的語氣提醒尚欠金額（以表上 **Price (HKD)** / **Payment Amount** 為準），並依公司政策說明付款方式（FPS、銀行轉帳等 — 只引用你已知或 SKILL / 知識庫內容，不要捏造帳號）。
5. 若找不到相符未付訂單：說明情況並請客戶提供訂單編號或下單電話以便查核。
6. **主動 WhatsApp（可選）**：若試算表 **Phone** 與目前對話聯絡人不同，且客戶或員工明確要求向該號碼發送催款，使用 **send_whatsapp**：`recipient` = 表上電話（含國碼數字），`message_type` = `text`，內容引用 **Order ID** 與尚欠金額。Playground 只會模擬發送，不會真的發出。
7. 完成查詢與回覆後結束 skill（標記完成），讓一般對話可繼續。

## 語言

跟隨客戶主要語言（粵語書面 / 英文 / 普通話書面），保持簡短、專業。
