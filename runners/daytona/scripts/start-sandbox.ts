import { resolve } from 'node:path';

import { config } from 'dotenv';

import { DaytonaRunner } from '../src/index';

config();

// Point at the real mastra build output from examples/agent
const outputDir = resolve(import.meta.dirname, '../../../examples/agent/.mastra/output');

console.log(`Using Mastra build output: ${outputDir}\n`);

const runner = new DaytonaRunner({
  apiKey: process.env.DAYTONA_API_KEY,
  public: true,
  // Allow all outbound traffic so Node.js can reach api.mastra.ai and other services
  networkAllowList: '0.0.0.0/0',
});

// Forward relevant API keys to the sandbox
const envVars: Record<string, string> = {};
for (const key of ['OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'MASTRA_CLOUD_ACCESS_TOKEN']) {
  if (process.env[key]) {
    envVars[key] = process.env[key]!;
  }
}

async function main() {
  if (!envVars.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is required. Add it to runners/daytona/.env');
    process.exit(1);
  }

  console.log(`Forwarding env vars: ${Object.keys(envVars).join(', ')}\n`);
  console.log('Starting sandbox...\n');

  const session = await runner.start({
    outputDirectory: outputDir,
    port: 4111,
    startCommand: 'MASTRA_STUDIO_PATH=studio node ./index.mjs',
    timeout: 90,
    envVars,
  });

  const url = session.url;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Mastra server is running in sandbox!`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n  URL: ${url}`);
  console.log(`  Session ID: ${session.id}`);
  console.log(`\nRoutes:`);
  console.log(`  curl ${url}/health`);
  console.log(`  curl ${url}/api`);
  console.log(`  curl ${url}/api/agents`);
  console.log(`  curl ${url}/api/agents/chefAgent`);
  console.log(`  curl '${url}/hello/world'`);

  // Smoke test
  console.log(`\n--- Smoke test ---`);

  let r = await runner.exec(session.id, 'curl -s http://localhost:4111/health');
  console.log(`  /health      → ${r.stdout.trim() || '(empty)'}`);

  r = await runner.exec(session.id, 'curl -s http://localhost:4111/api/agents');
  const raw = r.stdout.trim();
  try {
    const agents = JSON.parse(raw);
    console.log(`  /api/agents  → ${agents.length} agents registered`);
    for (const a of agents) {
      console.log(`                 - ${a.id || a.name}`);
    }
  } catch {
    console.log(`  /api/agents  → ${raw || '(empty)'}`);
  }

  r = await runner.exec(session.id, "curl -s 'http://localhost:4111/hello/world'");
  console.log(`  /hello/world → ${r.stdout.trim() || '(empty)'}`);

  // Dump server logs
  console.log(`\n--- Server logs (last 200 lines) ---`);
  const logs = await runner.getLogs(session.id, { tail: 200 });
  console.log(logs || '(no logs found)');
  console.log(`--- End server logs ---`);

  console.log(`\nPress Ctrl+C to stop the sandbox and clean up.\n`);

  const cleanup = async () => {
    console.log('\nStopping sandbox...');
    await runner.stop(session.id);
    console.log('Done.');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await new Promise(() => {});
}

main().catch(async err => {
  console.error('Error:', err);
  process.exit(1);
});
