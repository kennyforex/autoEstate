# Mille quotation — template & tone (optional)

Use when you need detail beyond **SKILL.md**. The sub-agent injects this file when you output **`LOAD_REFERENCE:template-tips.md`** (or **`LOAD_REFERENCE`** for all reference files). Do not duplicate the step-by-step checklist from SKILL here.

## Word template & `{tag}` runs

- The merged file at runtime is still **`assets/mille-quotation.docx`** via `office_files` (`uploads_path` relative to the skill install directory inside `execute_skill`).
- To change layout, logos, headers, or footers, edit **`assets/mille-quotation.docx`** in Microsoft Word (recommended). Keep each `{tag}` as **one continuous run**—if Word splits the braces across runs, Docxtemplater may miss the placeholder; retype the `{tag}` in a single run if needed.
- The bootstrap template often places `{quote_ref}` in the **header** and `{valid_until}` in the **footer** as well as the body—if you edit in Word, verify those positions still match your JSON keys (see SKILL.md for key names).

## Branding tone

- Professional, warm, concise. Bilingual OK (繁中 / EN) to match the customer.
- Do not invent prices; totals must match what the customer confirmed.

## PDF / LibreOffice

If **`docx_to_pdf`** fails on the server, fall back to sharing the DOCX public URL and explain PDF conversion—same as SKILL.md.
