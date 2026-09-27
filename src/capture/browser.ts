/**
 * Chromium lifecycle.
 *
 * One long-lived browser, a fresh context per run. Launching per render costs ~300ms and a
 * lot of memory; sharing a context leaks state between renders. A context per run is the
 * middle ground.
 *
 * The launch args exist for reproducibility, not performance. Font hinting varies with the
 * host's font configuration, so disabling it keeps text metrics identical across machines —
 * which is what makes the fit loop's measurements mean the same thing everywhere.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';

let browser: Browser | null = null;

const LAUNCH_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--force-color-profile=srgb',
  '--disable-background-timer-throttling',
];

/**
 * Drives the locally installed Google Chrome by default, and Playwright's bundled Chromium
 * when `CAROUSEL_CRAFTER_BROWSER=bundled`.
 *
 * The default is a constraint, not a preference: Playwright stopped shipping Chromium builds
 * for macOS 12, so `playwright install chromium` refuses there while Chrome itself still
 * works. Bundled is the better choice wherever it is available — a pinned Chromium makes
 * text metrics, and therefore renders, identical across machines, where system Chrome
 * updates underneath you. The Docker image sets it for exactly that reason.
 */
export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;

  const bundled = process.env.CAROUSEL_CRAFTER_BROWSER?.trim() === 'bundled';
  browser = await chromium.launch({
    headless: true,
    ...(bundled ? {} : { channel: 'chrome' }),
    args: LAUNCH_ARGS,
  });
  return browser;
}

export interface ContextOptions {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export async function withContext<T>(
  { width, height, deviceScaleFactor }: ContextOptions,
  fn: (context: BrowserContext) => Promise<T>,
): Promise<T> {
  const instance = await getBrowser();
  const context = await instance.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    // Pinned so a differing host locale or clock can never change what is drawn.
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    forcedColors: 'none',
    colorScheme: 'dark',
  });
  try {
    return await fn(context);
  } finally {
    await context.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
