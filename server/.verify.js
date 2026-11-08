const { execSync } = require('child_process');
const B='https://ai.fanggame.company';
const sh=(c)=>execSync(c,{maxBuffer:40*1024*1024}).toString();
const j=(p)=>JSON.parse(sh(`curl.exe -s -m 120 "${B}${p}"`).replace(/^\uFEFF/,''));
const head=(p)=>sh(`curl.exe -s -m 90 -o NUL -D - ${p}`).split('\r\n');

console.log('=== health ===');
console.log(JSON.stringify(j('/api/bili/health').data));

console.log('\n=== feed ===');
const f1=j('/api/bili/feed?page=1&ps=5');
console.log('ok='+f1.ok, 'via='+f1.data.source, 'n='+f1.data.items.length);
console.log(JSON.stringify(f1.data.items[0]));
const h2=head(`"${B}/api/bili/feed?page=1&ps=5"`).filter(l=>/x-cache|x-bili-via/i.test(l));
console.log('headers#2:', h2.join(' | '));

console.log('\n=== search ===');
const s=j('/api/bili/search?keyword=%E4%BE%AF%E5%92%94%E5%92%94&page=1');
console.log('ok='+s.ok,'via='+s.data.via,'n='+s.data.items.length);
console.log(JSON.stringify(s.data.items[0]));

console.log('\n=== video ===');
const v=j('/api/bili/video?bvid=BV1BA4K6UEAb');
console.log('ok='+v.ok, 'title='+v.data.title, 'cid='+v.data.cid, 'pages='+v.data.pages.length);

console.log('\n=== play ===');
const p=j('/api/bili/play?bvid=BV1BA4K6UEAb');
console.log('ok='+p.ok,'quality='+p.data.quality.label,'accept='+JSON.stringify(p.data.accept),'durl='+p.data.durl.length);
console.log('cdn='+new URL(p.data.durl[0].url).host);

console.log('\n=== related ===');
const r=j('/api/bili/related?bvid=BV1BA4K6UEAb');
console.log('ok='+r.ok,'n='+r.data.items.length, JSON.stringify(r.data.items[0]).slice(0,160));

console.log('\n=== img ===');
const ih=head(`"${B}/api/bili/img?url=` + encodeURIComponent('https://i0.hdslb.com/bfs/archive/3d5af886354cc0a1d8bb87f198dd16c78def1f2e.jpg') + '"');
console.log(ih.filter(l=>/HTTP|content-type|content-length|cache-control/i.test(l)).join(' | '));

console.log('\n=== stream (Range 0-2047) ===');
const sh2=head(`"${p.data.durl[0].proxy}" -r 0-2047`);
console.log(sh2.filter(l=>/HTTP|content-range|content-length|accept-ranges|x-bili-cdn/i.test(l)).join('\n'));
