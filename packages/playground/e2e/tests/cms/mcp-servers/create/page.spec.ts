import { test, expect, Page } from '@playwright/test';
import { resetStorage } from '../../../__utils__/reset-storage';

function uniqueServerName(prefix = 'Test Server') {
  return `${prefix} ${Date.now().toString(36)}`;
}

async function fillMCPServerFields(page: Page, options: { name?: string; version?: string }) {
  if (options.name !== undefined) {
    const nameInput = page.locator('#mcp-server-name');
    await nameInput.clear();
    await nameInput.fill(options.name);
  }

  if (options.version !== undefined) {
    const versionInput = page.locator('#mcp-server-version');
    await versionInput.clear();
    await versionInput.fill(options.version);
  }
}

async function openCreateDialog(page: Page) {
  await page.goto('/mcps');
  const createButton = page.getByRole('button', { name: 'Create MCP server' });
  await expect(createButton).toBeVisible({ timeout: 15000 });
  await createButton.click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Create MCP Server', level: 1 })).toBeVisible({
    timeout: 5000,
  });
}

test.afterEach(async () => {
  await resetStorage();
});

test.describe('Dialog Opens', () => {
  test('create button opens side dialog', async ({ page }) => {
    await openCreateDialog(page);

    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Create MCP Server', level: 1 })).toBeVisible();
    await expect(page.locator('#mcp-server-name')).toBeVisible();
    await expect(page.locator('#mcp-server-version')).toBeVisible();
  });

  test('create button only shows when editor is available', async ({ page }) => {
    await page.goto('/mcps');
    const createButton = page.getByRole('button', { name: 'Create MCP server' });
    await expect(createButton).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Validation', () => {
  test('shows error toast when submitting empty form', async ({ page }) => {
    await openCreateDialog(page);

    // Clear the name field (should be empty by default, but clear to be safe)
    const nameInput = page.locator('#mcp-server-name');
    await nameInput.clear();

    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Please fill in all required fields')).toBeVisible({ timeout: 5000 });
  });

  test('shows validation error when name is empty', async ({ page }) => {
    await openCreateDialog(page);

    const nameInput = page.locator('#mcp-server-name');
    await nameInput.clear();

    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Name is required')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Creation with Tools', () => {
  test('creates MCP server with name and version', async ({ page }) => {
    await openCreateDialog(page);

    const serverName = uniqueServerName('Basic');
    await fillMCPServerFields(page, { name: serverName, version: '2.0.0' });

    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('MCP server created successfully')).toBeVisible({ timeout: 10000 });
  });

  test('creates MCP server with tool selection', async ({ page }) => {
    await openCreateDialog(page);

    const serverName = uniqueServerName('With Tools');
    await fillMCPServerFields(page, { name: serverName });

    // Wait for tools to load and toggle weatherInfo
    await expect(page.getByText('Available Tools')).toBeVisible({ timeout: 10000 });

    const weatherSwitch = page
      .locator('div:has(> [role="switch"])')
      .filter({ hasText: 'weatherInfo' })
      .getByRole('switch');
    await weatherSwitch.click();

    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('MCP server created successfully')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Error Handling', () => {
  test('shows error toast on creation failure', async ({ page }) => {
    await page.route('**/stored/mcp-servers', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal server error' }),
        });
      } else {
        route.continue();
      }
    });

    await openCreateDialog(page);

    await fillMCPServerFields(page, { name: uniqueServerName('Error Test') });

    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Failed to create MCP server')).toBeVisible({ timeout: 10000 });

    // Dialog should stay open
    await expect(page.locator('#mcp-server-name')).toBeVisible();
  });
});
