import { test, expect, type Page } from '@playwright/test'

/**
 * Cookie consent tests.
 *
 * The banner is gated behind a PostHog feature flag (`cookie-banner`).
 * When the flag is absent / false the banner auto-grants consent, so in
 * local tests we simulate "EU mode" by:
 *
 * 1. Intercepting PostHog's `/decide` API to return `cookie-banner: true`
 * 2. Monkey-patching the PostHog client so `isFeatureEnabled('cookie-banner')`
 *    returns `true` and calling `featureFlags.override()`.
 *
 * Key tracking scripts that should only load AFTER consent:
 *   - Google Tag Manager  (googletagmanager.com/gtag)
 *   - HubSpot             (js.hs-scripts.com)
 *   - Reo.dev             (static.reo.dev)
 *
 * Consent is persisted in `localStorage` under `cookie-consent`.
 */

const TRACKING_SCRIPT_PATTERNS = [/googletagmanager\.com\/gtag/, /js\.hs-scripts\.com/, /static\.reo\.dev/]

/**
 * Force the cookie banner to appear by making the PostHog feature flag
 * `cookie-banner` return `true` (simulating an EU visitor).
 */
async function simulateEUVisitor(page: Page) {
  // Strategy 1: Intercept PostHog /decide endpoint
  await page.route('**/decide/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        featureFlags: { 'cookie-banner': true },
        featureFlagPayloads: {},
        errorsWhileComputingFlags: false,
      }),
    })
  })

  // Strategy 2: Monkey-patch posthog-js once loaded
  await page.addInitScript(() => {
    let _patchApplied = false

    const patchPosthog = (ph: any) => {
      if (_patchApplied || !ph) return
      _patchApplied = true

      const origIsEnabled = ph.isFeatureEnabled?.bind(ph)
      ph.isFeatureEnabled = (flag: string, ...args: any[]) => {
        if (flag === 'cookie-banner') return true
        return origIsEnabled ? origIsEnabled(flag, ...args) : undefined
      }

      // Force the flags loaded state so the React hook uses our override
      if (ph.featureFlags && typeof ph.featureFlags.override === 'function') {
        ph.featureFlags.override({ 'cookie-banner': true })
      }
    }

    // Poll for posthog to be initialized
    const checkInterval = setInterval(() => {
      if ((window as any).posthog?.__loaded) {
        patchPosthog((window as any).posthog)
        clearInterval(checkInterval)
      }
    }, 50)

    setTimeout(() => clearInterval(checkInterval), 10_000)
  })
}

/** Collect all requested script URLs during a page lifecycle. */
function trackScriptRequests(page: Page): () => string[] {
  const urls: string[] = []
  page.on('request', req => {
    if (req.resourceType() === 'script') {
      urls.push(req.url())
    }
  })
  return () => urls
}

/** Navigate with a clean consent state (EU visitor simulation already applied). */
async function goWithCleanConsent(page: Page, path = '/docs') {
  // First visit: clear any existing consent
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.removeItem('cookie-consent'))

  // Second visit: clean state
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
}

// ─── Banner visibility ─────────────────────────────────────────────────

test.describe('Cookie consent banner', () => {
  test('banner appears for EU visitors (simulated)', async ({ page }) => {
    await simulateEUVisitor(page)
    await goWithCleanConsent(page)

    const banner = page.getByText('We use tracking cookies')
    await expect(banner).toBeVisible({ timeout: 15_000 })

    await expect(page.getByRole('button', { name: 'Accept cookies' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Decline cookies' })).toBeVisible()
  })

  test('banner does NOT appear for non-EU visitors', async ({ page }) => {
    // Don't simulate EU — default behavior (feature flag absent → not EU)
    await page.goto('/docs', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.removeItem('cookie-consent'))

    await page.goto('/docs', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const banner = page.getByText('We use tracking cookies')
    await expect(banner).not.toBeVisible()
  })
})

// ─── Declining cookies blocks tracking ─────────────────────────────────

test.describe('Declining cookies', () => {
  test('clicking "Decline" hides the banner and stores the choice', async ({ page }) => {
    await simulateEUVisitor(page)
    await goWithCleanConsent(page)

    const banner = page.getByText('We use tracking cookies')
    await expect(banner).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Decline cookies' }).click()

    // Banner should disappear
    await expect(banner).not.toBeVisible()

    // localStorage should record the refusal
    const stored = await page.evaluate(() => localStorage.getItem('cookie-consent'))
    expect(stored).toBe('false')
  })

  test('tracking scripts are NOT loaded after declining', async ({ page }) => {
    await simulateEUVisitor(page)
    await goWithCleanConsent(page)

    await expect(page.getByText('We use tracking cookies')).toBeVisible({ timeout: 15_000 })
    const getScripts = trackScriptRequests(page)

    await page.getByRole('button', { name: 'Decline cookies' }).click()
    // Give the page a moment to potentially (incorrectly) inject scripts
    await page.waitForTimeout(3000)

    const scriptUrls = getScripts()
    for (const pattern of TRACKING_SCRIPT_PATTERNS) {
      const matches = scriptUrls.filter(url => pattern.test(url))
      expect(matches, `Tracking script matching ${pattern} was loaded despite declining cookies`).toHaveLength(0)
    }
  })

  test('HubSpot doNotTrack is set after declining', async ({ page }) => {
    await simulateEUVisitor(page)
    await goWithCleanConsent(page)

    await expect(page.getByText('We use tracking cookies')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Decline cookies' }).click()
    await page.waitForTimeout(1000)

    // Verify the doNotTrack script is present in the DOM
    const hasDoNotTrack = await page.evaluate(() => {
      const script = document.getElementById('hubspot-gdpr')
      return script?.textContent?.includes('doNotTrack') ?? false
    })
    expect(hasDoNotTrack, 'HubSpot doNotTrack script should be present after declining').toBe(true)
  })
})

// ─── Accepting cookies loads tracking ──────────────────────────────────

test.describe('Accepting cookies', () => {
  test('clicking "Accept" hides the banner and stores the choice', async ({ page }) => {
    await simulateEUVisitor(page)
    await goWithCleanConsent(page)

    const banner = page.getByText('We use tracking cookies')
    await expect(banner).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Accept cookies' }).click()

    // Banner should disappear
    await expect(banner).not.toBeVisible()

    // localStorage should record consent
    const stored = await page.evaluate(() => localStorage.getItem('cookie-consent'))
    expect(stored).toBe('true')
  })

  test('HubSpot doNotTrack script is removed after accepting', async ({ page }) => {
    await simulateEUVisitor(page)
    await goWithCleanConsent(page)

    await expect(page.getByText('We use tracking cookies')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Accept cookies' }).click()
    await page.waitForTimeout(2000)

    // After accepting, the doNotTrack script should be gone
    const hasDoNotTrack = await page.evaluate(() => {
      const script = document.getElementById('hubspot-gdpr')
      return script?.textContent?.includes('doNotTrack') ?? false
    })
    expect(hasDoNotTrack, 'HubSpot doNotTrack should be removed after accepting').toBe(false)
  })
})

// ─── Consent persistence ───────────────────────────────────────────────

test.describe('Consent is remembered', () => {
  test('after declining, banner stays hidden on next page load', async ({ page }) => {
    await simulateEUVisitor(page)

    // First visit: decline cookies
    await goWithCleanConsent(page)
    await expect(page.getByText('We use tracking cookies')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Decline cookies' }).click()
    await expect(page.getByText('We use tracking cookies')).not.toBeVisible()

    // Second visit: navigate to a different page
    await page.goto('/docs/getting-started/start', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Banner should NOT reappear
    await expect(page.getByText('We use tracking cookies')).not.toBeVisible()

    // localStorage choice should still be set
    const stored = await page.evaluate(() => localStorage.getItem('cookie-consent'))
    expect(stored).toBe('false')
  })

  test('after declining, tracking scripts stay blocked on subsequent pages', async ({ page }) => {
    await simulateEUVisitor(page)

    // First visit: decline
    await goWithCleanConsent(page)
    await expect(page.getByText('We use tracking cookies')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Decline cookies' }).click()

    // Second visit: track scripts on a fresh navigation
    const getScripts = trackScriptRequests(page)
    await page.goto('/docs/getting-started/start', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const scriptUrls = getScripts()
    for (const pattern of TRACKING_SCRIPT_PATTERNS) {
      const matches = scriptUrls.filter(url => pattern.test(url))
      expect(
        matches,
        `Tracking script matching ${pattern} loaded on subsequent page despite prior decline`,
      ).toHaveLength(0)
    }
  })

  test('after accepting, banner stays hidden on next page load', async ({ page }) => {
    await simulateEUVisitor(page)

    // First visit: accept cookies
    await goWithCleanConsent(page)
    await expect(page.getByText('We use tracking cookies')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Accept cookies' }).click()
    await expect(page.getByText('We use tracking cookies')).not.toBeVisible()

    // Second visit: navigate to a different page
    await page.goto('/docs/getting-started/start', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Banner should NOT reappear
    await expect(page.getByText('We use tracking cookies')).not.toBeVisible()

    // localStorage choice should still be set
    const stored = await page.evaluate(() => localStorage.getItem('cookie-consent'))
    expect(stored).toBe('true')
  })
})
