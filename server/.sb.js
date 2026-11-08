const { execSync } = require('child_process');
const base='https://ai.fanggame.company';
const play = JSON.parse(execSync(`curl.exe -s -m 90 "${base}/api/bili/play?bvid=BV1BA4K6UEAb"`).toString());
const d = play.data.durl[0];
const urls = [d.url, ...d.backup].filter(Boolean);
console.log('count', urls.length);
for (const u of urls) {
  const host = new URL(u).host;
  const r = execSync(`curl.exe -s -m 40 -o NUL -D - -r 0-1023 "${base}/api/bili/stream?url=` + encodeURIComponent(u) + '"').toString();
  const line = r.split('\r\n')[0];
  console.log(line, '|', host);
}
