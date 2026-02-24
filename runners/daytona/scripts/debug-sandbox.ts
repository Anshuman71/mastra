import { resolve } from 'node:path';

import { config } from 'dotenv';

import { DaytonaRunner } from '../src/index';

config();

const outputDir = resolve(import.meta.dirname, '../../../examples/agent/.mastra/output');

console.log(`Using Mastra build output: ${outputDir}\n`);

const runner = new DaytonaRunner({ apiKey: process.env.DAYTONA_API_KEY, public: true });

async function main() {
  console.log('Preparing sandbox...\n');

  const session = await runner.prepare({
    outputDirectory: outputDir,
    port: 4111,
  });

  console.log(`Sandbox ${session.id} prepared.\n`);

  // Try running the server directly to capture its error output
  console.log('--- Trying to start server (captures output for 10s) ---');
  const r = await runner.exec(session.id, 'cd /home/daytona && PORT=4111 node ./index.mjs 2>&1', { timeout: 10 });
  console.log(`Exit code: ${r.exitCode}`);
  console.log(`Output:\n${r.stdout}`);

  console.log('\n--- Cleaning up ---');
  await runner.stop(session.id);
  console.log('Done.');
}

main().catch(async err => {
  console.error('Error:', err);
  process.exit(1);
});
