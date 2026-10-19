// css·js 내용으로 버전(해시 8자리)을 만들어 sonata-6at.html의 ?v=… 를 모두 바꾼다.
// 파일이 바뀌면 주소가 바뀌므로 방문자의 브라우저가 예전 파일을 쓰지 않는다.
// 실행: npm run bump  (git pre-commit 훅이 자동으로 실행: .githooks/pre-commit)
// --check: 바꾸지 않고, 맞지 않으면 실패만 한다(테스트·CI용)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'sonata-6at.html');

function assetVersion() {
  const html = fs.readFileSync(HTML, 'utf8');
  const files = [...html.matchAll(/(?:href|src)="((?:css|js)\/[\w.-]+)\?v=[\w.-]+"/g)].map(m => m[1]);
  const h = crypto.createHash('sha1');
  files.forEach(f => h.update(f).update(fs.readFileSync(path.join(ROOT, f))));
  return { version: h.digest('hex').slice(0, 8), files, html };
}
module.exports = { assetVersion };

if (require.main === module) {
  const { version, html } = assetVersion();
  const next = html.replace(/((?:css|js)\/[\w.-]+)\?v=[\w.-]+"/g, `$1?v=${version}"`);
  if (process.argv.includes('--check')) {
    if (next !== html) { console.error(`버전이 맞지 않습니다. node scripts/bump-version.js 를 실행하세요 (새 버전 ${version})`); process.exit(1); }
    console.log('버전 맞음: ' + version);
  } else if (next !== html) { fs.writeFileSync(HTML, next); console.log('버전 → ' + version); }
  else console.log('그대로: ' + version);
}
