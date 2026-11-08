#!/usr/bin/env node
/**
 * scan-dark-surfaces.js —— 全系统「扫黑」扫描器
 *
 * 用途：在浅色 / 深色主题下遍历主壳 + 所有 iframe 应用里可见的界面元素，
 * 找出「大块深色表面」（面积 ≥ 400px²、平均亮度 < 60），用于发现浅色主题下
 * 仍然写成纯黑 / 近黑的按钮、图标底、卡片、弹层等。
 *
 * 用法（在项目根目录或任意目录）：
 *   node tools/scan-dark-surfaces.js --mode=light --label=after
 *   node tools/scan-dark-surfaces.js --mode=dark  --label=after
 *   node tools/scan-dark-surfaces.js --mode=light --label=before --target="Nexus OS 26.scanbaseline.html"
 *   node tools/scan-dark-surfaces.js --mode=light --label=after --apps=all
 *
 * 参数：
 *   --mode    light | dark           默认 light
 *   --label   报告文件名后缀          默认 run
 *   --target  要扫描的 HTML 文件名（相对项目根，默认 "nexus os 26/Nexus OS 26.html"）
 *   --apps    core | all | none      默认 core（约 12 个代表性内置应用）
 *
 * 输出：tools/scan-<label>-<mode>.json，并在终端打印按面积排序的命中摘要。
 * 说明：只在扫描时打开应用/弹层，扫描结束后不修改任何项目文件。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// 项目根 = 外壳目录的上一级（HTML 里的 ../miui、../Desktop icon 资源在上一层）
const ROOT = path.resolve(__dir, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || '1'] : [a, '1']; }));
const MODE = (args.mode || 'light').toLowerCase();
const LABEL = args.label || 'run';
const TARGET = args.target || 'nexus os 26/Nexus OS 26.html';
const APPS_MODE = (args.apps || 'core').toLowerCase();
const PORT = Number(args.port || 8830);
const CDP_PORT = 9000 + (process.pid % 800);
const EDGE = args.edge || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const CORE_APPS = ['settings', 'files', 'appstore', 'agent', 'terminal', 'music', 'album', 'news', 'studio', 'weather', 'taskmgr', 'browser'];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/' + TARGET;
  const full = path.join(ROOT, p.replace(/^\//, ''));
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(full).pipe(res);
  });
});

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pend = new Map(); }
  async open() { this.ws = new WebSocket(this.url); await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pend.has(d.id)) { const { res, rej } = this.pend.get(d.id); this.pend.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); } }; }
  send(method, params = {}, sid) { const id = ++this.id; return new Promise((res, rej) => { this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId: sid })); }); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hitsByKey = new Map();

function absorb(list, state) {
  for (const h of list) {
    const key = h.frame + '|' + h.sel + '|' + h.kind;
    const prev = hitsByKey.get(key);
    if (!prev || h.area > prev.area) hitsByKey.set(key, { ...h, state });
  }
}

function summary(list, n = 25) {
  return list.slice(0, n).map(h => `  ${String(h.area).padStart(6)}px²  lum=${String(h.lum).padStart(3)}  ${h.kind.padEnd(8)} ${h.frame}/${h.sel}  ${h.text ? '“' + h.text + '”' : ''}`).join('\n');
}

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const profile = path.join(os.tmpdir(), 'n26-scan-' + Date.now());
  const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-extensions', '--disable-background-networking', '--window-size=1600,900', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  let ver = null;
  for (let i = 0; i < 90; i++) { try { const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version'); if (r.ok) { ver = await r.json(); break; } } catch { } await sleep(300); }
  if (!ver) throw new Error('Edge CDP 未启动');
  const cdp = new CDP(ver.webSocketDebuggerUrl); await cdp.open();
  const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const att = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const SID = att.sessionId;
  await cdp.send('Page.enable', {}, SID);
  await cdp.send('Runtime.enable', {}, SID);
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, SID);
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  const url = `http://127.0.0.1:${PORT}/` + TARGET.split('/').map(encodeURIComponent).join('/');
  await cdp.send('Page.navigate', { url }, SID);
  let booted = false;
  for (let i = 0; i < 200; i++) { if (await ev(`document.readyState==='complete' && typeof window.enterDesktop==='function'`)) { booted = true; break; } await sleep(250); }
  if (!booted) throw new Error('页面未能启动（检查 --target 路径）：' + url);
  await sleep(600);

  // 干净的本地档案：一个账户、正确系统文件、浅色主题。
  // 注意：必须走页面自己的 setLS（NexusDB 初始化后直接写 localStorage 会被 DB 缓存覆盖）。
  await ev(`(async () => {
    const now = Date.now();
    const mk = () => ({ type: 'file', content: '' });
    const sys = { 'kernel.nex': mk(), 'system.nex': mk(), 'boot.nex': mk(), 'core.nex': mk() };
    setLS('installed', true);
    setLS('accounts', [{ name: '审计员', password: '', role: 'admin', avatar: '', createdAt: now }]);
    setLS('lastAccount', '审计员');
    setLS('disks', [{ letter: 'C', size: 500, system: true }]);
    setLS('user_审计员_settings', { theme: 'island', wallpaper: 0, style: 'glass', animations: true, fanguiStyle: 'liquid', dockPosition: 'bottom' });
    setLS('user_审计员_extraSettings', { darkMode: false, autoDarkMode: false, tourDone: true });
    setLS('user_审计员_filesystem', { C: { type: 'drive', children: { System: { type: 'folder', children: sys } } } });
    setLS('user_审计员_n26TourDone', '1');
    await new Promise(r => setTimeout(r, 600));
    return 1;
  })()`);
  await sleep(600);
  await cdp.send('Page.navigate', { url }, SID);
  for (let i = 0; i < 200; i++) { if (await ev(`document.readyState==='complete' && typeof window.enterDesktop==='function'`)) break; await sleep(250); }
  await sleep(2200);
  // 等锁屏就绪后登录（空密码账户）
  for (let i = 0; i < 60; i++) {
    const ready = await ev(`(() => { const l = document.getElementById('lock-screen'); return !!l && getComputedStyle(l).display !== 'none' && !!document.getElementById('passwordInput'); })()`);
    if (ready === true) break;
    await sleep(300);
  }
  bottom: {
    const r = await ev(`(() => { try { tryLogin(); return 'ok'; } catch (e) { return String(e); } })()`);
    if (r !== 'ok') console.log('tryLogin:', r);
  }
  for (let i = 0; i < 80; i++) {
    const ok = await ev(`(() => { const l = document.getElementById('lock-screen'); return (!l || getComputedStyle(l).display === 'none') && typeof openApp === 'function'; })()`);
    if (ok === true) break;
    await sleep(300);
  }
  await sleep(1200);

  if (MODE === 'dark') { await ev(`n26ApplyDarkMode(true)`); await sleep(900); }
  else { await ev(`n26ApplyDarkMode(false)`); await sleep(900); }
  const applied = await ev(`({mode: document.documentElement.getAttribute('data-mode'), cls: document.body.className})`);
  console.log('主题状态:', JSON.stringify(applied));

  // 注入扫描器
  await ev(`(() => {
    const IGNORE = new Set(['IMG','VIDEO','CANVAS','SVG','PATH','RECT','G','DEFS','HR','SCRIPT','STYLE','LINK','META','HEAD','TITLE']);
    function parseCol(s) { if (!s) return null; const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[,/\\s]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    function lum(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
    function stops(bi) { const ms = [...bi.matchAll(/rgba?\\(([^)]+)\\)/g)]; return ms.map(m => { const p = m[1].split(/[,/\\s]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }).filter(c => c.a > 0.2); }
    function sel(el, stop) { const parts = []; let e = el; while (e && e.nodeType === 1) { let s = e.tagName.toLowerCase(); if (e.id) s += '#' + e.id; else { const cl = (e.className && typeof e.className === 'string') ? e.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3).join('.') : ''; if (cl) s += '.' + cl; } parts.unshift(s); if (e === stop) break; e = e.parentElement; } return parts.slice(-4).join(' > '); }
    function scanDoc(doc, frame) {
      const out = [];
      const win = doc.defaultView || window;
      for (const el of doc.querySelectorAll('*')) {
        if (IGNORE.has(el.tagName)) continue;
        let cs; try { cs = win.getComputedStyle(el); } catch (e) { continue; }
        if (!cs || cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) continue;
        if (el === doc.documentElement || el === doc.body) continue;
        let r; try { r = el.getBoundingClientRect(); } catch (e) { continue; }
        const area = Math.round(r.width * r.height);
        if (area < 400) continue;
        const bg = parseCol(cs.backgroundColor);
        let hit = null, kind = '', L = 0;
        const hasGrad = /gradient/.test(cs.backgroundImage);
        if (hasGrad) {
          // 渐变：把各 stop 的平均色（含 alpha）合成到实色底上，再看平均亮度
          const st = stops(cs.backgroundImage);
          if (st.length >= 1) {
            const aAvg = st.reduce((a, c) => a + c.a, 0) / st.length;
            const cAvg = { r: st.reduce((a, c) => a + c.r * c.a, 0) / st.length / (aAvg || 1), g: st.reduce((a, c) => a + c.g * c.a, 0) / st.length / (aAvg || 1), b: st.reduce((a, c) => a + c.b * c.a, 0) / st.length / (aAvg || 1), a: aAvg };
            const base = (bg && bg.a >= 0.35) ? bg : { r: 255, g: 255, b: 255, a: 1 };
            const eff = { r: cAvg.r * aAvg + base.r * (1 - aAvg), g: cAvg.g * aAvg + base.g * (1 - aAvg), b: cAvg.b * aAvg + base.b * (1 - aAvg) };
            const totalA = aAvg + (base.a || 1) * (1 - aAvg);
            if (totalA >= 0.35 && lum(eff) < 60) { hit = eff; kind = 'gradient'; L = lum(eff); }
          }
        }
        if (!hit && !hasGrad && bg && bg.a >= 0.35 && lum(bg) < 60) { hit = bg; kind = 'solid'; L = lum(bg); }
        if (!hit) continue;
        out.push({ frame, sel: sel(el, doc.body), tag: el.tagName.toLowerCase(), area, w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, img: String(cs.backgroundImage).slice(0, 110), lum: Math.round(L), kind, text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 36) });
      }
      for (const img of doc.querySelectorAll('img')) {
        let r; try { r = img.getBoundingClientRect(); } catch (e) { continue; }
        if (r.width * r.height < 400 || !img.complete || !img.naturalWidth) continue;
        try {
          const c = document.createElement('canvas'); c.width = 16; c.height = 16;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0, 16, 16);
          const d = g.getImageData(0, 0, 16, 16).data; let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
          const L = s / n;
          if (L < 60) out.push({ frame, sel: sel(img, doc.body), tag: 'img', area: Math.round(r.width * r.height), w: Math.round(r.width), h: Math.round(r.height), bg: '(image)', img: img.currentSrc || img.src, lum: Math.round(L), kind: 'image', text: img.alt || '' });
        } catch (e) { /* 跨域图片无法取样 */ }
      }
      doc.querySelectorAll('iframe').forEach((f, i) => { try { if (f.contentDocument && f.contentDocument.body) scanDoc(f.contentDocument, frame + '>' + (f.id || (f.src || '').split('/').pop() || i)); } catch (e) { } });
      return out;
    }
    window.__n26scan = () => scanDoc(document, 'main');
    return 1;
  })()`);
  const scan = async (state) => {
    const r = await ev(`window.__n26scan ? window.__n26scan() : {__err:'no scanner'}`);
    if (Array.isArray(r)) { absorb(r, state); return r.length; }
    console.log('scan err:', JSON.stringify(r)); return 0;
  };

  // 1) 桌面 + 顶栏 + Dock
  await ev(`(() => { document.querySelectorAll('.window').forEach(w => { w.style.opacity='0'; w.style.pointerEvents='none'; }); return 1; })()`);
  await sleep(400);
  console.log('桌面命中:', await scan('desktop'));

  // 2) 开始菜单 / 启动台 / 控制中心 / 通知 / 右键菜单 / AI 小方
  const overlays = [
    ['smtile', `n26ToggleTileMenu()`, `n26TileMenuClose()`],
    ['launchpad', `openLaunchpad()`, `closeLaunchpad()`],
    ['control-center', `toggleControlCenter()`, `toggleControlCenter()`],
    ['notifications', `(() => { const e=document.getElementById('notification-sidebar'); if(e){e.classList.add('show');} return 1; })()`, `(() => { const e=document.getElementById('notification-sidebar'); if(e){e.classList.remove('show');} return 1; })()`],
    ['context-menu', `(() => { const e=document.getElementById('globalContextMenu')||document.getElementById('desktopContextMenu'); if(e){e.classList.add('show'); e.style.display='block';} return 1; })()`, `(() => { document.querySelectorAll('.context-menu').forEach(e=>{e.classList.remove('show');e.style.display='';}); return 1; })()`],
    ['ai-chat', `openN26AiChat()`, `closeN26AiChat()`],
  ];
  for (const [name, open, close] of overlays) {
    try {
      const r = await ev(`(() => { try { ${open}; return 1; } catch(e) { return String(e); } })()`);
      if (r && r.__err) { console.log('overlay ' + name + ' 打开失败:', r.__err); continue; }
      await sleep(800);
      console.log(name + ' 命中:', await scan(name));
      await ev(`(() => { try { ${close}; } catch(e) {} return 1; })()`);
      await sleep(500);
    } catch (e) { console.log('overlay ' + name + ' 异常:', String(e).slice(0, 120)); }
  }

  // 3) 内置应用（逐个打开后扫描；窗口叠放不影响 computed 取色）
  const apps = APPS_MODE === 'none' ? [] : (APPS_MODE === 'all'
    ? await ev(`(() => { try { return Object.keys(appRegistry); } catch(e) { return []; } })()`)
    : CORE_APPS);
  await ev(`(() => { document.querySelectorAll('.window').forEach(w => { w.style.opacity=''; w.style.pointerEvents=''; }); return 1; })()`);
  for (const id of apps) {
    const opened = await ev(`(() => { try { openApp('${id}'); return 1; } catch(e) { return String(e); } })()`);
    if (opened && opened.__err) { console.log('app ' + id + ' 打开失败:', opened.__err); continue; }
    await sleep(1900);
    const n = await scan('app:' + id);
    console.log('app ' + id + ' 命中:', n);
    // 关掉最上层窗口，避免无限堆叠
    await ev(`(() => { try { const ws=[...document.querySelectorAll('.window')]; const w=ws[ws.length-1]; if(w){ const b=w.querySelector('.window-close, .win-close, [onclick*="closeWindow"]'); if(b) b.click(); else w.remove(); } } catch(e){} return 1; })()`);
    await sleep(350);
  }

  const all = [...hitsByKey.values()].sort((a, b) => b.area - a.area);
  // 过滤掉全屏遮罩（面积≈视口）与整窗背景，避免淹没细节；仍记录在 full 数组
  const viewportArea = 1600 * 900;
  const surfaces = all.filter(h => h.area < viewportArea * 0.92);
  const report = {
    meta: { generatedAt: new Date().toISOString(), mode: MODE, label: LABEL, target: TARGET, apps: APPS_MODE, threshold: { minArea: 400, maxLum: 60 }, theme: applied, totalHits: all.length, surfaceHits: surfaces.length },
    hits: surfaces,
    fullscreenOrWindow: all.filter(h => h.area >= viewportArea * 0.92).map(h => ({ frame: h.frame, sel: h.sel, area: h.area, bg: h.bg, lum: h.lum, kind: h.kind, state: h.state })),
  };
  const file = path.join(__dir, `scan-${LABEL}-${MODE}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log('\n==== 命中摘要（面积降序，纯文字已排除）====');
  console.log(summary(surfaces, 30) || '  （无命中）');
  console.log(`\n共 ${surfaces.length} 个深色表面命中，报告：${file}`);

  await cdp.send('Page.close', {}, SID).catch(() => { });
  edge.kill(); server.close(); process.exit(0);
}

main().catch(e => { console.error('FAILED', e); try { server.close(); } catch { } process.exit(1); });
