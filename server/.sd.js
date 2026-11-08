const { execSync } = require('child_process');
const base='https://ai.fanggame.company';
const play = JSON.parse(execSync(`curl.exe -s -m 90 "${base}/api/bili/play?bvid=BV1BA4K6UEAb"`).toString());
const u = play.data.durl[0].url;
const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const h = `-H "User-Agent: ${ua}" -H "Referer: https://www.bilibili.com/" -H "Origin: https://www.bilibili.com"`;
const r = execSync(`curl.exe -s -m 60 -o NUL -D - -r 0-1023 ${h} "${u}"`).toString();
console.log('LOCAL RANGE:', r.split('\r\n').slice(0,6).join(' | '));
