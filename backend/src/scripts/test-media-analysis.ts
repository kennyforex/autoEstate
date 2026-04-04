/**
 * Smoke: media_analysis requires mediaDataUrl.
 * Integration: OPENROUTER_API_KEY + image URL.
 * Usage: npx tsx src/scripts/test-media-analysis.ts
 */
import 'dotenv/config';
import { MediaAnalysisTool } from '../agent/tools/mediaAnalysis.tool.js';
import { stubAgentContext } from './lib/stubAgentContext.js';

export async function run(): Promise<void> {
  const t = new MediaAnalysisTool();
  const r = await t.execute({ mediaType: 'image', mediaDataUrl: '', prompt: 'describe' }, stubAgentContext);
  if (r.success) throw new Error('expected failure without media URL');
  console.log('PASS', t.name);
}

if (process.argv[1]?.includes('test-media-analysis')) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
