const { execSync } = require('child_process');
const base='https://ai.fanggame.company';
const play = JSON.parse(execSync(`curl.exe -s -m 90 "${base}/api/bili/play?bvid=BV1BA4K6UEAb"`).toString());
const u = play.data.durl[0].url;
console.log('target host:', new URL(u).host);
const out = execSync(`curl.exe -s -m 60 -r 0-1023 "${base}/api/bili/stream?url=` + encodeURIComponent(u) + '"').toString();
console.log(out.slice(0,300));
execSync(`curl.exe -s -m 40 -o NUL -D - "${u}"`).toString().split('\r\n').slice(0,6).forEach(l=>console.log('DIRECT:',l));
