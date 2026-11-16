// Load a URL like a mid-range phone on slow 4G and report timings + what was downloaded.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'https://lumabyy.netlify.app/', label = process.argv[3] || '';
async function run(ctx, warm) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const res = [];
  cdp.on('Network.responseReceived', e => res.push({ id: e.requestId, url: e.response.url, type: e.type, fromSW: e.response.fromServiceWorker, cache: e.response.fromDiskCache }));
  const sizes = {}; cdp.on('Network.loadingFinished', e => sizes[e.requestId] = e.encodedDataLength);
  if (!warm) await p.evaluate(() => 0).catch(() => {});
  const t0 = Date.now();
  await p.goto(URL, { waitUntil: 'load' });
  const tLoad = Date.now() - t0;
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
    const lcpE = performance.getEntriesByType('largest-contentful-paint'); 
    return { ttfb: Math.round(nav.responseStart), domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: Math.round(fcp || 0) };
  });
  const lcp = await p.evaluate(() => new Promise(r => { new PerformanceObserver(l => { const e = l.getEntries(); r(Math.round(e[e.length - 1].startTime)); }).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => r(null), 500); }));
  const rows = res.map(r => ({ url: r.url.replace(/^https?:\/\//, '').slice(0, 70), type: r.type, kb: +((sizes[r.id] || 0) / 1024).toFixed(1), sw: r.fromSW, disk: r.cache }));
  const total = rows.reduce((s, r) => s + r.kb, 0);
  await p.close();
  return { m: { ...m, lcp }, rows, total: +total.toFixed(1) };
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cold = await run(ctx, false);
  console.log(`${label} COLD (first visit):`, JSON.stringify(cold.m), `transferred ${cold.total} KB`);
  cold.rows.sort((a, b) => b.kb - a.kb).slice(0, 12).forEach(r => console.log(`   ${String(r.kb).padStart(7)} KB  ${r.type.padEnd(10)} ${r.url}`));
  const warm = await run(ctx, true);
  console.log(`${label} WARM (repeat visit):`, JSON.stringify(warm.m), `transferred ${warm.total} KB`);
  await b.close();
})();
