import { chromium } from 'playwright-core';
const OUT = '/tmp/claude-0/-home-user-accountancyos/916274ed-c579-511f-8436-6046231e16aa/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const shots = [
  { url: 'http://localhost:4333/', file: 'home-desktop.png', w: 1440, full: true },
  { url: 'http://localhost:4333/', file: 'home-mobile.png', w: 390, full: true, mobile: true },
  { url: 'http://localhost:4333/who-we-help/established-businesses/', file: 'service-desktop.png', w: 1440, full: true },
  { url: 'http://localhost:4333/contact/', file: 'contact-desktop.png', w: 1440, full: true },
];
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    isMobile: !!s.mobile,
  });
  const page = await ctx.newPage();
  await page.goto(s.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s.file}`, fullPage: s.full });
  await ctx.close();
  console.log('shot', s.file);
}
await browser.close();
