/**
 * Runs local/smoke checks for all agent tools (no API keys required for most).
 *
 * Usage (from backend/): npx tsx src/scripts/test-all-tools.ts
 */
import 'dotenv/config';
import { run as runKnowledgeBase } from './test-knowledge-base.js';
import { run as runAskClarification } from './test-ask-clarification.js';
import { run as runContactLookup } from './test-contact-lookup.js';
import { run as runConversationHistory } from './test-conversation-history.js';
import { run as runMediaAnalysis } from './test-media-analysis.js';
import { run as runGoogleGmail } from './test-google-gmail.js';
import { run as runGoogleDrive } from './test-google-drive.js';
import { run as runGoogleSheets } from './test-google-sheets.js';
import { run as runGoogleDocs } from './test-google-docs.js';
import { run as runPdfToolkit } from './test-pdf-toolkit.js';
import { run as runOfficeFiles } from './test-office-files.js';
import { run as runFileToolkit } from './test-file-toolkit.js';
import { run as runWebFetchStatic } from './test-web-fetch-static.js';
import { run as runWebBrowser } from './test-web-browser.js';
import { run as runWebSearch } from './test-web-search.js';
import { run as runExecuteSkill } from './test-execute-skill.js';

async function main(): Promise<void> {
  const runners = [
    ['knowledge_base', runKnowledgeBase],
    ['ask_clarification', runAskClarification],
    ['contact_lookup', runContactLookup],
    ['conversation_history', runConversationHistory],
    ['media_analysis', runMediaAnalysis],
    ['google_gmail', runGoogleGmail],
    ['google_drive', runGoogleDrive],
    ['google_sheets', runGoogleSheets],
    ['google_docs', runGoogleDocs],
    ['pdf_toolkit', runPdfToolkit],
    ['office_files', runOfficeFiles],
    ['file_toolkit', runFileToolkit],
    ['web_fetch_static', runWebFetchStatic],
    ['web_browser', runWebBrowser],
    ['web_search', runWebSearch],
    ['execute_skill', runExecuteSkill],
  ] as const;

  console.log('=== test-all-tools (smoke) ===\n');
  for (const [name, fn] of runners) {
    process.stdout.write(`[${name}] `);
    await fn();
  }
  console.log('\n=== all smoke steps finished ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
