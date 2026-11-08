// 只读静态分析：抽取两套系统的 CSS 动效/节奏/间距/排版参数分布
const fs = require('fs');
const path = require('path');

const R1 = 'D:\\20533\\Desktop\\FluentOS-On-Web';
const R2 = 'D:\\20533\\deskbox\\files\\小方规划\\小游戏\\nexus os 26\\nexus os 26';

function read(p) { return fs.readFileSync(p, 'utf8'); }
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

function collect(sources) {
  const decls = [];
  let cssAll = '';
  for (const s of sources) {
    const raw = stripComments(s.content);
    cssAll += '\n' + raw;
    // 声明（含 @media 内部）
    const re = /([a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
    let m;
    while ((m = re.exec(raw))) {
      decls.push({ file: s.file, prop: m[1].trim().toLowerCase(), value: m[2].trim().replace(/\s+/g, ' ') });
    }
  }
  return { decls, cssAll };
}

const toMs = (v) => {
  const s = v.trim();
  if (/ms$/i.test(s)) return parseFloat(s);
  if (/s$/i.test(s)) return parseFloat(s) * 1000;
  return null;
};
const numbers = (v) => (v.match(/-?\d*\.?\d+(?:px|rem|em|%)?/g) || []);
const pxVals = (v) => numbers(v).filter(x => x.endsWith('px')).map(x => parseFloat(x));

function push(map, k) { map[k] = (map[k] || 0) + 1; }
function dist(arr) {
  const out = {};
  for (const x of arr) push(out, String(x));
  return out;
}

function analyze(label, sources) {
  const { decls, cssAll } = collect(sources);
  const durations = [], easings = [], delays = [], propsAll = [], propCounts = [];
  const fontSize = [], fontWeight = [], lineHeight = [], letterSpacing = [];
  const space = [], radius = [], zIndex = [], shadows = [], blurs = [];
  let important = 0, transitionAll = 0, keyframes = 0, colorDecls = 0, hexColors = 0, varUses = 0;
  const layoutAnimProps = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, margin: 0, padding: 0, filter: 0 };

  for (const d of decls) {
    if (/!important/i.test(d.value)) important++;
    if (/var\(--/.test(d.value)) varUses++;
    if (/\btransition\b/.test(d.prop)) {
      const v = d.value;
      if (/\ball\b/.test(v)) transitionAll++;
      const parts = v.split(',');
      for (const p of parts) {
        const times = (p.match(/(-?\d*\.?\d+)(ms|s)\b/g) || []);
        times.forEach(t => durations.push(toMs(t)));
        const e = p.match(/(linear|ease-in-out|ease-in|ease-out|ease|cubic-bezier\([^)]*\)|steps\([^)]*\)|spring[^,]*)/i);
        if (e) easings.push(e[1].toLowerCase());
        const prop = p.trim().split(/\s+/)[0] || '';
        if (prop && !/^(transform|opacity|all|none|color|background|box-shadow|filter|border|width|height)/.test(prop) && !/^(flex|grid|margin|padding|top|left|right|bottom|height|width|filter)/.test(prop) && !/^-?\d/.test(prop)) {
          push(propCounts, prop);
        }
        for (const lp of Object.keys(layoutAnimProps)) if (prop.includes(lp)) layoutAnimProps[lp]++;
      }
    }
    if (d.prop.startsWith('animation')) {
      const times = d.value.match(/(-?\d*\.?\d+)(ms|s)\b/g) || [];
      // animation 简写里第一个时间通常是 duration，第二个是 delay
      times.forEach((t, i) => {
        const ms = toMs(t);
        if (ms == null) return;
        if (i === 0) durations.push(ms); else delays.push(ms);
      });
      const e = d.value.match(/(linear|ease-in-out|ease-in|ease-out|ease|cubic-bezier\([^)]*\)|steps\([^)]*\))/i);
      if (e) easings.push(e[1].toLowerCase());
    }
    if (d.prop === 'transition-duration' || d.prop === 'animation-duration') {
      (d.value.match(/(-?\d*\.?\d+)(ms|s)\b/g) || []).forEach(t => { const ms = toMs(t); if (ms != null) durations.push(ms); });
    }
    if (d.prop === 'transition-delay' || d.prop === 'animation-delay') {
      (d.value.match(/(-?\d*\.?\d+)(ms|s)\b/g) || []).forEach(t => { const ms = toMs(t); if (ms != null) delays.push(ms); });
    }
    if (d.prop === 'transition-timing-function' || d.prop === 'animation-timing-function') easings.push(d.value.toLowerCase());
    if (d.prop === 'font-size') { fontSize.push(d.value); }
    if (d.prop === 'font-weight') fontWeight.push(d.value);
    if (d.prop === 'line-height') lineHeight.push(d.value);
    if (d.prop === 'letter-spacing') letterSpacing.push(d.value);
    if (['margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left','gap','row-gap','column-gap'].includes(d.prop)) {
      pxVals(d.value).forEach(v => space.push(v));
    }
    if (d.prop === 'border-radius') pxVals(d.value).forEach(v => radius.push(v));
    if (d.prop === 'z-index') { const n = parseInt(d.value); if (!isNaN(n)) zIndex.push(n); }
    if (d.prop === 'box-shadow') shadows.push(d.value);
    if (d.prop === 'backdrop-filter' || d.prop === '-webkit-backdrop-filter') blurs.push(d.value);
    if (/^(color|background|background-color|border-color|border-top-color|border-bottom-color)$/.test(d.prop)) {
      colorDecls++;
      hexColors += (d.value.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
    }
  }
  keyframes = (cssAll.match(/@keyframes\s+[a-zA-Z0-9_-]+/g) || []).length;

  const durSorted = [...durations].sort((a,b)=>a-b);
  const under120 = durations.filter(x=>x<120).length;
  const over400 = durations.filter(x=>x>400).length;
  const mid = durations.filter(x=>x>=120 && x<=400).length;

  return {
    label,
    files: sources.map(s=>s.file),
    declarations: decls.length,
    animations: {
      durationSamples: durations.length,
      durationDist: dist(durations),
      durationMedian: durSorted.length ? durSorted[Math.floor(durSorted.length/2)] : null,
      durationP90: durSorted.length ? durSorted[Math.floor(durSorted.length*0.9)] : null,
      under120, mid, over400,
      under120Pct: durations.length ? +(under120/durations.length*100).toFixed(1) : 0,
      over400Pct: durations.length ? +(over400/durations.length*100).toFixed(1) : 0,
      easingDist: dist(easings),
      delayDist: dist(delays),
      transitionAll,
      keyframes,
      layoutAnimProps,
    },
    typography: {
      fontSizeDist: dist(fontSize),
      fontSizeCount: fontSize.length,
      fontWeightDist: dist(fontWeight),
      lineHeightDist: dist(lineHeight),
      lineHeightCount: lineHeight.length,
      letterSpacingDist: dist(letterSpacing),
    },
    spacing: {
      count: space.length,
      distinct: Object.keys(dist(space)).length,
      valueDist: dist(space),
      mod4Pct: space.length ? +(space.filter(v=>v%4===0).length/space.length*100).toFixed(1) : 0,
      mod8Pct: space.length ? +(space.filter(v=>v%8===0).length/space.length*100).toFixed(1) : 0,
    },
    material: {
      radiusDist: dist(radius),
      shadowDecls: shadows.length,
      shadowLayerDist: dist(shadows.map(s=>s.split(/,(?![^()]*\))/).length)),
      blurDecls: blurs.length,
      blurDist: dist(blurs.map(b => {
        const m = b.match(/blur\(([^)]+)\)/); return m ? m[1] : b;
      })),
    },
    tokens: { varUses, important, colorDecls, hexColors },
    zIndexDist: dist(zIndex),
  };
}

const fluentSources = fs.readdirSync(path.join(R1,'css')).filter(f=>f.endsWith('.css')).map(f=>({file:'css/'+f, content:read(path.join(R1,'css',f))}));

// Nexus：主文件内联 <style> + 主文件 <link> 引用的本地 css + ui/*.css + fangui/core/*.css
const nexusHtml = read(path.join(R2,'Nexus OS 26.html'));
const inlineStyles = [...nexusHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
const links = [...nexusHtml.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(h=>!h.startsWith('http') && !h.startsWith('data:'));
const nexusSources = [{file:'Nexus OS 26.html (inline <style>)', content:inlineStyles}];
for (const f of fs.readdirSync(path.join(R2,'ui')).filter(f=>f.endsWith('.css') && !/\.bak/.test(f))) {
  nexusSources.push({file:'ui/'+f, content:read(path.join(R2,'ui',f))});
}
for (const f of fs.readdirSync(path.join(R2,'fangui','core')).filter(f=>f.endsWith('.css'))) {
  nexusSources.push({file:'fangui/core/'+f, content:read(path.join(R2,'fangui','core',f))});
}
const linkSources = [];
for (const h of links) {
  const p = path.join(R2, h.replace(/^\.\//,''));
  if (fs.existsSync(p) && fs.statSync(p).isFile() && p.endsWith('.css')) linkSources.push({file:'linked:'+h, content:read(p)});
}
nexusSources.push(...linkSources);

const out = {
  generatedAt: new Date().toISOString(),
  fluent: analyze('FluentOS', fluentSources),
  nexus: analyze('Nexus OS 26', nexusSources),
};
fs.writeFileSync(path.join(__dirname,'css-metrics.json'), JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
