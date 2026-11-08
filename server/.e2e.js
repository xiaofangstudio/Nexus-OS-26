const { execSync } = require('child_process');
const base='https://ai.fanggame.company';
function get(u){ return execSync(`curl.exe -s -m 90 "${u}"`,{maxBuffer:20*1024*1024}).toString(); }
// play
const play = JSON.parse(get(base+'/api/bili/play?bvid=BV1BA4K6UEAb').replace(/^\uFEFF/,''));
console.log('PLAY', play.ok, play.data.quality.label, play.data.accept.length, 'durl', play.data.durl.length);
const u = play.data.durl[0].url;
const proxy = base + '/api/bili/stream?url=' + encodeURIComponent(u);
const head = execSync(`curl.exe -s -m 60 -o NUL -D - -r 0-1023 "${proxy}"`).toString();
console.log('STREAM-206 headers:\n' + head.split('\r\n').filter(l=>/HTTP|Content-Range|Content-Length|Content-Type|Accept-Ranges|access-control-allow-origin/i.test(l)).join('\n'));
const img = base + '/api/bili/img?url=' + encodeURIComponent(play.data.durl.length? 'https://i0.hdslb.com/bfs/archive/3d5af886354cc0a1d8bb87f198dd16c78def1f2e.jpg':'');
const imgHead = execSync(`curl.exe -s -m 40 -o NUL -D - "${img}"`).toString();
console.log('IMG:\n' + imgHead.split('\r\n').filter(l=>/HTTP|Content-Type|Content-Length|access-control-allow-origin/i.test(l)).join('\n'));
const rel = JSON.parse(get(base+'/api/bili/related?bvid=BV1BA4K6UEAb').replace(/^\uFEFF/,''));
console.log('RELATED', rel.ok ? 'n='+rel.data.items.length : rel.code+' '+rel.error);
const rank = JSON.parse(get(base+'/api/bili/ranking?rid=0').replace(/^\uFEFF/,''));
console.log('RANKING', rank.ok ? 'n='+rank.data.items.length : rank.code+' '+rank.error);
const hlt = JSON.parse(get(base+'/api/bili/health').replace(/^\uFEFF/,''));
console.log('HEALTH', JSON.stringify(hlt.data));
