# Mille quotation — extended reference

Use this file when you need extra context beyond **SKILL.md**. Output `**LOAD_REFERENCE`** in your reasoning if you need to pull this block into the conversation (sub-agent will inject it).

## Merge template (Word)

- The **runtime** file used by `office_files` → `docx_fill_template` is: `**uploads_path: templates/mille-quotation.docx`** (under server `uploads/`).
- The **source copy** in the repo is `**template.docx`** in this skill folder. Install/deploy copies it to `uploads/templates/` when you run `install-mille-create-quotation-skill.ts`.
- To change layout, logos, headers, or footers: edit `**template.docx`** in Microsoft Word (recommended) or regenerate the bootstrap file with `generate-mille-quotation-template.ts` (do **not** overwrite a customized template without a backup).

## Branding tone

- Professional, warm, concise. Bilingual OK (繁中 / EN) to match the customer.
- Do not invent prices; totals must match what the customer confirmed.

## Docxtemplater placeholders (must match JSON keys)

Use a single JSON object in `template_data_json` with these keys (string values unless noted):

- `quote_ref` — e.g. `Q-MILLE-YYYYMMDD-001`
- `quote_date` — e.g. `2026-04-04`
- `valid_until` — expiry date
- `client_name`, `company`, `phone`, `email`
- `line_items` — multiline text (items, qty, unit price)
- `total_hkd`
- `prepared_by`
- `notes` — terms, payment, delivery caveats

The bootstrap template places `**{quote_ref}`** in the **header** and `**{valid_until}`** in the **footer** as well as in the body. If you edit in Word, keep each `{tag}` as **one continuous run** (retype if Word splits the braces).

## Tools

1. `docx_fill_template` with `uploads_path: templates/mille-quotation.docx`, optional `output_docx_uploads_path`, `include_docx_base64: false` when saving under `uploads/`.
2. `docx_to_pdf` with matching `.docx` → `.pdf` paths (requires LibreOffice on the server).