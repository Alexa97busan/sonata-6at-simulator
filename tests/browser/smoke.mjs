// 화면 자동 검사(헤드리스 크롬, Playwright). 실행: node tests/browser/smoke.mjs
// 사이트를 직접 띄워 열고, 운전해 보고, 서킷 코스를 고르고, 휴대폰 크기도 본다. 오류가 있으면 실패한다.
// 스크린샷은 tests/browser/out/에 남긴다(GitHub에서는 작업 결과물로 올린다).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'tests/browser/out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const URL0 = `http://127.0.0.1:${server.address().port}/sonata-6at.html`;

const problems = [];
let noGL = false;
const fail = m => { problems.push(m); console.error('✖ ' + m); };
const ok = m => console.log('✔ ' + m);
const browserOpts = { channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] };
const browser = await chromium.launch(browserOpts);
{ const t = await browser.newPage(); noGL = !(await t.evaluate(() => !!document.createElement('canvas').getContext('webgl'))); await t.close(); }
try {
  // 1) 데스크톱: 오류 없이 열리고, D + 가속으로 차가 움직이고, 계기판이 바뀐다
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => fail('페이지 오류: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !(noGL && /WebGL context/.test(m.text()))) fail('콘솔 오류: ' + m.text()); });
  await page.goto(URL0, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (noGL) console.log('⚠ 이 브라우저에 WebGL이 없어 3D 검사는 건너뜁니다');
  await page.locator('#drive').scrollIntoViewIfNeeded();
  await page.keyboard.press('d');
  await page.keyboard.down('ArrowUp');
  let kmh = 0; for (let i = 0; i < 38 && kmh <= 5; i++) { await page.waitForTimeout(400); kmh = +(await page.textContent('#kmhTxt')); }   // 처음 몇 초는 느릴 수 있어 넉넉히 기다린다
  await page.keyboard.up('ArrowUp');
  kmh > 5 ? ok(`D + 가속: ${kmh} km/h`) : fail(`차가 움직이지 않음(${kmh} km/h)`);
  const gear = await page.textContent('#gearTxt');
  /^[DM]\d$/.test(gear) ? ok('기어 표시 ' + gear) : fail('기어 표시가 이상함: ' + gear);
  // 3D: three.js를 불러와 주행 화면 캔버스가 생겼는지
  if (!noGL) {
    await page.waitForSelector('#box3D canvas', { timeout: 15000 }).then(() => ok('주행 3D 캔버스'), () => fail('주행 3D 캔버스가 없음'));
    const msg3D = await page.textContent('#msg3D');
    /불러오지 못했/.test(msg3D) ? fail('3D 불러오기 실패: ' + msg3D) : ok('3D 불러오기');
  }
  // 2) 서킷 코스: 랩 표시와 코너 안내가 나온다
  await page.click('#courseSeg button:has-text("서킷")');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(3000); await page.keyboard.up('ArrowUp');
  if (!noGL) { const lap = await page.textContent('#dLap'); /랩 \d/.test(lap) ? ok('서킷 랩 표시: ' + lap) : fail('서킷 랩 표시가 없음: ' + lap); }
  // 3) 사이드 브레이크·핸들: 직접 핸들로 바뀐다
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space'); await page.keyboard.up('ArrowRight');
  (await page.textContent('#steerMode')).includes('직접') ? ok('핸들·사이드 브레이크로 직접 운전 전환') : fail('직접 운전으로 바뀌지 않음');
  await page.locator('.drive-box').screenshot({ path: path.join(OUT, 'drive-desktop.png') });
  // 4) 변속기 단면 3D까지 내려가 본다
  await page.locator('#trans3d').scrollIntoViewIfNeeded(); await page.waitForTimeout(2500);
  await page.locator('#trans3d').screenshot({ path: path.join(OUT, 'trans3d.png') });
  if (!noGL) (await page.$('#boxT canvas')) ? ok('변속기 단면 3D') : fail('변속기 단면 3D 캔버스가 없음');
  await page.close();

  // 5) 휴대폰 크기: 옆으로 넘치지 않고, 조작 막대가 보인다
  const m = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  m.on('pageerror', e => fail('휴대폰 페이지 오류: ' + e.message));
  await m.goto(URL0, { waitUntil: 'load' }); await m.waitForTimeout(1500);
  const over = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  over ? fail('휴대폰에서 화면이 옆으로 넘침') : ok('휴대폰 너비 맞음');
  (await m.isVisible('#pedalbar')) ? ok('휴대폰 조작 막대') : fail('휴대폰 조작 막대가 안 보임');
  await m.screenshot({ path: path.join(OUT, 'mobile.png') });
} finally {
  await browser.close(); server.close();
}
if (problems.length) { console.error(`\n실패 ${problems.length}개`); process.exit(1); }
if (noGL && process.env.CI) { console.error('CI에서는 WebGL이 있어야 합니다'); process.exit(1); }
console.log('\n화면 검사 통과');
