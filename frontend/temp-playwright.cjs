const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => {
    console.log('BROWSER CONSOLE:', msg.type(), msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('BROWSER ERROR:', err.message);
  });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('usuarioLogado', JSON.stringify({ email: 'test@example.com' }));
  });
  await page.goto('http://127.0.0.1:4173/registro-movimentacao', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'registro-mov.png', fullPage: true });
  await browser.close();
})();
