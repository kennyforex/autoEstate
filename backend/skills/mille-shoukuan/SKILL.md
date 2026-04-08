---
name: mille-shoukuan
description: >-
  Handles payment receipt capture and order sheet updates for Mille (收款／收據核對).
  Use when staff or workflows need to capture payment proof from uploads, sync to Google Drive,
  and reconcile rows in the order spreadsheet (install script sets default required tools).
argument-hint: "[order id or receipt upload]"
user-invocable: true
metadata:
  display_name: Mille 收款項
  version: 1.0.0
  category: payments
  language: zh-HK + English
  reminder_delay: 0
  max_reminders: 0
  trigger_hints:
    - 收款
    - 收據
    - payment proof
    - 轉數快
    - FPS
    - receipt upload
  required_tools:
    - document_data_capture
    - google_drive
    - google_sheets
steps:
  - id: capture
    label: 使用 document_data_capture 擷取收據或付款證明上的金額與參考資料
    collects: receipt_data
  - id: sync
    label: 依店內流程更新試算表列或上傳 Drive（與其他訂單技能一致）
    collects: sheet_sync
---

# Mille 收款項

此技能為 **佔位／範本**：實際業務流程請與店內「蛋糕訂購」或「追收款項」技能對齊，並補上試算表 ID、欄位對應與 Drive 資料夾設定（可放在 `metadata` 或延伸 `references/`）。

安裝後腳本會設定 `requiredTools` 為 `document_data_capture`、`google_drive`、`google_sheets`。請在具備 Google 連線的環境下測試。
