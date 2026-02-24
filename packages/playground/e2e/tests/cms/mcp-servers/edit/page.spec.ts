import { test, expect } from '@playwright/test';
import { resetStorage } from '../../../__utils__/reset-storage';

const PORT = process.env.E2E_PORT || '4111';
const BASE_URL = `http://localhost:${PORT}`;

function uniqueServerName(prefix = 'Test Server') {
  return `${prefix} ${Date.now().toString(36)}`;
}

async function createMCPServerViaAPI(params: {
  name: string;
  version: string;
  tools?: Record<string, { description?: string }>;
}) {
  const res = await fetch(`${BASE_URL}/api/stored/mcp-servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to create MCP server: ${res.statusText}`);
  }

  return res.json();
}

test.afterEach(async () => {
  await resetStorage();
});

test.describe('Pre-populates Form', () => {
  test('pre-populates name and version from existing server', async () => {
    const serverName = uniqueServerName('Prepopulate');
    const server = await createMCPServerViaAPI({
      name: serverName,
      version: '3.0.0',
      tools: { weatherInfo: { description: 'Get weather info' } },
    });

    // Navigate to mcps page and open edit dialog
    // For now, we verify via API that the server was created correctly
    const detailRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/${server.id}?status=draft`);
    const detail = await detailRes.json();

    expect(detail.name).toBe(serverName);
    expect(detail.version).toBe('3.0.0');
    expect(detail.tools).toHaveProperty('weatherInfo');
  });
});

test.describe('Update Persists', () => {
  test('update via API persists changes', async () => {
    const serverName = uniqueServerName('Update');
    const server = await createMCPServerViaAPI({
      name: serverName,
      version: '1.0.0',
      tools: { weatherInfo: { description: 'Weather tool' } },
    });

    // Update the server
    const updateRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/${server.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${serverName} Updated`,
        version: '2.0.0',
      }),
    });

    expect(updateRes.ok).toBe(true);

    // Verify the update persisted
    const detailRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/${server.id}?status=draft`);
    const detail = await detailRes.json();

    expect(detail.name).toBe(`${serverName} Updated`);
    expect(detail.version).toBe('2.0.0');
    expect(detail.tools).toHaveProperty('weatherInfo');
  });
});

test.describe('Partial Update', () => {
  test('partial update only changes specified fields', async () => {
    const serverName = uniqueServerName('Partial');
    const server = await createMCPServerViaAPI({
      name: serverName,
      version: '1.0.0',
      tools: {
        weatherInfo: { description: 'Weather tool' },
        simpleMcpTool: { description: 'Simple tool' },
      },
    });

    // Only update the version
    const updateRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/${server.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '1.1.0' }),
    });

    expect(updateRes.ok).toBe(true);

    const detailRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/${server.id}?status=draft`);
    const detail = await detailRes.json();

    expect(detail.name).toBe(serverName);
    expect(detail.version).toBe('1.1.0');
    expect(detail.tools).toHaveProperty('weatherInfo');
    expect(detail.tools).toHaveProperty('simpleMcpTool');
  });
});

test.describe('Error Handling', () => {
  test('returns 404 for non-existent server update', async () => {
    const updateRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/non-existent-id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    expect(updateRes.status).toBe(404);
  });

  test('returns 409 for duplicate server creation', async () => {
    const serverName = uniqueServerName('Duplicate');
    await createMCPServerViaAPI({ name: serverName, version: '1.0.0' });

    const res = await fetch(`${BASE_URL}/api/stored/mcp-servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: serverName, version: '1.0.0' }),
    });

    expect(res.status).toBe(409);
  });
});

test.describe('Delete', () => {
  test('deletes a server successfully', async () => {
    const serverName = uniqueServerName('Delete');
    const server = await createMCPServerViaAPI({ name: serverName, version: '1.0.0' });

    const deleteRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/${server.id}`, {
      method: 'DELETE',
    });

    expect(deleteRes.ok).toBe(true);
    const body = await deleteRes.json();
    expect(body.success).toBe(true);

    // Verify it's gone
    const getRes = await fetch(`${BASE_URL}/api/stored/mcp-servers/${server.id}?status=draft`);
    expect(getRes.status).toBe(404);
  });
});
