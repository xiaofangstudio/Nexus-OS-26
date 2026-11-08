const fs=require('fs');
const j=JSON.parse(fs.readFileSync('.p.json','utf8').replace(/^\uFEFF/,''));
const d=j.data;
console.log(JSON.stringify({len:d.len,jsonBvid:d.hasJsonBvid,bvTotal:d.bvTotal,bvUnique:d.bvUnique,titles:d.titleBlocks}));
console.log('JSON:', (d.jsonSnippet||'').slice(0,500));
console.log('CARD:', (d.cardSnippet||'').slice(0,300));
