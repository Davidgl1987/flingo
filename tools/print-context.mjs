import fs from 'node:fs';
import path from 'node:path';

const files = [
  'AGENTS.md',
  'docs/MVP_STATUS.md',
  'docs/definitions/GAMEPLAY_CONTRACT.md',
  'docs/instructions/NEXT_SESSION_PROMPT.md',
  'docs/instructions/QA_CHECKLIST.md',
];

for (const file of files) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) continue;
  console.log(`\n\n===== ${file} =====\n`);
  console.log(fs.readFileSync(fullPath, 'utf8'));
}
