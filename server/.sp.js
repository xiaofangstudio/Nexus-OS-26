const { execSync } = require('child_process');
const base='https://ai.fanggame.company';
const play = JSON.parse(execSync(`curl.exe -s -m 90 "${base}/api/bili/play?bvid=BV1BA4K6UEAb"`).toString());
console.log('durl[0].url host:', new URL(play.data.durl[0].url).host, '| backup:', play.data.durl[0].backup.map(x=>new URL(x).host).join(','));
const r = execSync(`curl.exe -s -m 60 -o NUL -D - -r 0-1023 "${play.data.durl[0].proxy}"`).toString();
console.log(r.split('\r\n').filter(l=>/HTTP|Content-Range|Content-Length|Content-Type|Accept-Ranges|X-Bili-Cdn/i.test(l)).join('\n'));
