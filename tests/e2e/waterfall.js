const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(process.argv[2], { waitUntil: 'load' });
  const r = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return { dcl: Math.round(nav.domContentLoadedEventStart), dclEnd: Math.round(nav.domContentLoadedEventEnd), proto: nav.nextHopProtocol,
      res: performance.getEntriesByType('resource').map(e => ({ n: e.name.replace(/^https:\/\/[^/]+/, '').slice(0, 45), s: Math.round(e.startTime), e: Math.round(e.responseEnd), kb: Math.round(e.transferSize / 1024), proto: e.nextHopProtocol })) };
  });
  console.log(`DCL start ${r.dcl} ms, DCL handlers end ${r.dclEnd} ms, page protocol ${r.proto}`);
  r.res.forEach(x => console.log(`${String(x.s).padStart(5)} → ${String(x.e).padStart(5)} ms ${String(x.kb).padStart(4)} KB ${x.proto.padEnd(4)} ${x.n}`));
  await b.close();
})();
