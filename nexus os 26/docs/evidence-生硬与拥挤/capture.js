// 只读运行时采集：截图 + 计算样式 + 动效快照 + 帧时间线
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = __dirname;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const TARGETS = {
  fluent: 'http://127.0.0.1:8811/index.html',
  nexus: 'http://127.0.0.1:8812/nexus%20os%2026/nexus%20os%2026/Nexus%20OS%2026.html',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launchEdge(port) {
  const profile = path.join(OUT, 'edge-profile-' + port);
  const proc = spawn(EDGE, [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    '--window-size=1440,900',
    '--force-device-scale-factor=1',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return proc;
    } catch (_) {}
    await sleep(300);
  }
  throw new Error('Edge CDP not ready');
}

async function newPage(port, url) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return r.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let id = 0;
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close() { try { ws.close(); } catch (_) {} },
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
      }
    };
    ws.onerror = reject;
  });
}

function seq(actions) {
  // 顺序执行，失败不中断
  return actions.reduce((p, fn) => p.then(fn).catch(e => { console.error('STEP FAIL:', e.message); }), Promise.resolve());
}

async function run(side, port) {
  const url = TARGETS[side];
  const proc = await launchEdge(port);
  const page = await newPage(port, 'about:blank');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const preload = side === 'fluent'
    ? `try{localStorage.setItem('fluentos.oobe_completed','1');}catch(e){}`
    : `try{localStorage.setItem('n26:installed','true');localStorage.setItem('n26:n26_first_boot_shown','true');localStorage.setItem('n26fb_done','1');}catch(e){}`;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: preload });

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
    return r.result.value;
  };
  const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(SHOTS, `${side}-${name}.png`), Buffer.from(r.data, 'base64'));
  };

  const metrics = {};
  const anims = {};
  const modalInfo = {};

  const SNAP = `(() => {
    const vis = el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity)>0; };
    const all=[...document.querySelectorAll('*')];
    const v=all.filter(vis);
    const leafText=v.filter(el=>el.children.length===0 && (el.textContent||'').trim().length>0);
    const vw=innerWidth, vh=innerHeight;
    let textArea=0; const textRect=[];
    for(const el of leafText){ const r=el.getBoundingClientRect(); const w=Math.max(0,Math.min(r.right,vw)-Math.max(r.left,0)); const h=Math.max(0,Math.min(r.bottom,vh)-Math.max(r.top,0)); if(w*h>0){textArea+=w*h; textRect.push({t:el.textContent.trim().slice(0,12),w:+w.toFixed(1),h:+h.toFixed(1),fs:getComputedStyle(el).fontSize});} }
    const fsDist={}; for(const t of textRect){fsDist[t.fs]=(fsDist[t.fs]||0)+1;}
    const shadow=v.filter(el=>getComputedStyle(el).boxShadow!=='none').length;
    const blur=v.filter(el=>{const b=getComputedStyle(el).backdropFilter||getComputedStyle(el).webkitBackdropFilter; return b&&b!=='none';}).length;
    const radius=v.filter(el=>{const r=getComputedStyle(el).borderRadius; return r&&r!=='0px';}).length;
    const border=v.filter(el=>{const s=getComputedStyle(el); return parseFloat(s.borderTopWidth)>0||parseFloat(s.borderBottomWidth)>0;}).length;
    const divider=v.filter(el=>{const s=getComputedStyle(el); return (parseFloat(s.borderBottomWidth)>0 && parseFloat(s.borderTopWidth)===0 && s.borderBottomStyle!=='none');}).length;
    const interactive=v.filter(el=>el.matches('button,a,input,select,[role="button"],[role="tab"],[tabindex]')).length;
    // 网格间距：含 >=4 个直接子元素且子元素有尺寸的容器，统计相邻间距
    const gaps=[];
    for(const el of v){ const kids=[...el.children].filter(vis); if(kids.length>=4 && kids.length<=40){ const rs=kids.map(k=>k.getBoundingClientRect()).sort((a,b)=>a.top-b.top||a.left-b.left); for(let i=1;i<rs.length;i++){ const a=rs[i-1],b=rs[i]; const dy=b.top-a.bottom, dx=b.left-a.right; if(dy>=0&&dy<60) gaps.push(+dy.toFixed(1)); else if(dx>=0&&dx<60) gaps.push(+dx.toFixed(1)); } } }
    gaps.sort((a,b)=>a-b);
    const fontSizes=[...new Set(Object.keys(fsDist))].sort((a,b)=>parseFloat(a)-parseFloat(b));
    return {vw,vh,elements:v.length,leafText:leafText.length,interactive,textArea:+textArea.toFixed(0),textAreaPct:+(textArea/(vw*vh)*100).toFixed(1),shadowEls:shadow,blurEls:blur,radiusEls:radius,borderEls:border,dividerEls:divider,fontSizes,fontSizeDist:fsDist,gapsCount:gaps.length,gapMedian:gaps.length?gaps[Math.floor(gaps.length/2)]:null,gapP10:gaps.length?gaps[Math.floor(gaps.length*0.1)]:null,gapP90:gaps.length?gaps[Math.floor(gaps.length*0.9)]:null,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight};
  })()`;

  const ANIM_SNAP = `(() => {
    try { return document.getAnimations().map(a=>{
      const eff=a.effect; const t=eff?eff.getComputedTiming():{};
      const tgt=eff&&eff.target;
      let name=''; try{name=tgt?(tgt.id||('.'+String(tgt.className||'').trim().split(/\\s+/).slice(0,2).join('.'))):'';}catch(e){}
      return {name, tag:tgt?tgt.tagName:null, animName:a.animationName||null, transProp:a.transitionProperty||null, dur:t.duration, delay:t.delay, easing:t.easing, start:a.startTime, state:a.playState, iter:t.iterations};
    }); } catch(e){ return {error:String(e)}; }
  })()`;

  const FRAME_START = `(() => { window.__frames=[]; window.__collect=true; let last=performance.now(); const loop=(ts)=>{ if(!window.__collect) return; window.__frames.push(+ts.toFixed(2)); requestAnimationFrame(loop); }; requestAnimationFrame(loop); return true; })()`;
  const FRAME_STOP = `(() => { window.__collect=false; const f=window.__frames||[]; const ds=f.slice(1).map((t,i)=>+(t-f[i]).toFixed(2)); return {frames:f.length, maxGap:f.length?+Math.max(...ds).toFixed(2):0, over16:ds.filter(x=>x>16.7).length, over32:ds.filter(x=>x>33.4).length, avg:ds.length?+(ds.reduce((a,b)=>a+b,0)/ds.length).toFixed(2):0}; })()`;

  // 1) 载入
  await cdp.send('Page.navigate', { url });
  await sleep(side === 'nexus' ? 8000 : 5000);

  // 2) 首次启动/锁屏处理
  const overlay = await ev(`(() => {
    const out={};
    for(const id of ['n26fbSkip','n26fbOverlay','login-screen','lock-screen','oobe-screen']){ const el=document.getElementById(id); if(el){ const r=el.getBoundingClientRect(); out[id]={w:+r.width.toFixed(0),h:+r.height.toFixed(0),display:getComputedStyle(el).display,opacity:getComputedStyle(el).opacity}; } }
    return out;
  })()`);
  modalInfo.overlays = overlay;
  await ev(`(() => { const b=document.getElementById('n26fbSkip'); if(b) b.click(); try{window.N26FB&&window.N26FB.skip&&window.N26FB.skip();}catch(e){} return true; })()`);
  await sleep(1500);
  if (side === 'nexus') {
    await ev(`(() => { try{window.N26FB&&window.N26FB.skip&&window.N26FB.skip();}catch(e){} const b=document.getElementById('n26fbSkip'); if(b) b.click(); const st=document.getElementById('n26fb-stage'); if(st) st.remove(); return true; })()`);
    await sleep(2500);
    await ev(`(() => { try{ if(typeof unlockScreen==='function') unlockScreen(); }catch(e){} const ls=document.getElementById('lock-screen'); if(ls) ls.click(); return true; })()`);
    await sleep(2500);
    await ev(`(() => { try{ if(typeof unlockScreen==='function') unlockScreen(); }catch(e){} const b=document.querySelector('.lock-avatar,.n26-lock-avatar,#lockAvatar'); if(b) b.click(); return true; })()`);
    await sleep(1500);
    await ev(`(() => { const skip=[...document.querySelectorAll('button,a,span,div')].find(el=>el.children.length===0 && el.textContent.trim()==='跳过引导'); if(skip) skip.click(); const st=document.querySelector('.n26-guide,.n26-tour,#n26Guide'); if(st) st.remove(); return true; })()`);
    await sleep(1200);
  }
  if (side === 'fluent') {
    await ev(`(() => { const ls=document.getElementById('lock-screen'); if(ls && !ls.classList.contains('hidden')) ls.click(); return true; })()`);
    await sleep(1200);
    await ev(`(() => { const p=document.getElementById('login-pin'); if(p){ p.value='1234'; } const s=document.getElementById('login-submit'); if(s) s.click(); return true; })()`);
    await sleep(2500);
    await ev(`(() => { const p=document.getElementById('login-pin'); if(p && !p.closest('#login-screen')?.classList.contains('hidden')){ p.value='1234'; document.getElementById('login-submit')?.click(); } return true; })()`);
    await sleep(1500);
  }
  await shot('01-desktop');
  metrics.desktop = await ev(SNAP);

  // 顶部/底部栏、图标、窗口等关键计算样式
  metrics.keyStyles = await ev(`(() => {
    const get=(sel,props)=>{ const el=document.querySelector(sel); if(!el) return null; const s=getComputedStyle(el); const o={}; for(const p of props) o[p]=s[p]; const r=el.getBoundingClientRect(); o.rect=[+r.x.toFixed(1),+r.y.toFixed(1),+r.width.toFixed(1),+r.height.toFixed(1)]; return o; };
    const P=['fontSize','fontWeight','lineHeight','letterSpacing','padding','gap','borderRadius','boxShadow','backgroundColor','color','height','minHeight','transition','backdropFilter','border'];
    const out={};
    for(const sel of ['#dock','#taskbar','#startMenu','#start-menu','#settingsPanel','.settings-panel','#launchpad','.desktop-icon','.desk-icon','.dock-item','.window','#desktop']){ const v=get(sel,P); if(v) out[sel]=v; }
    return out;
  })()`);

  // 3) 开始菜单
  const openStart = side === 'fluent' ? `StartMenu.open()` : `toggleStartMenu()`;
  const closeStart = side === 'fluent' ? `StartMenu.close()` : `(()=>{ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true})); ['startMenu','smTileMenu','launchpad'].forEach(id=>{const e=document.getElementById(id); if(e){e.classList.remove('show','open','visible'); e.style.display='none';}}); return true; })()`;
  await ev(FRAME_START);
  await ev(`(()=>{ ${openStart}; return true; })()`);
  await sleep(60);
  anims.startMenuOpen = await ev(ANIM_SNAP);
  await sleep(250);
  await shot('02-startmenu-250ms');
  await sleep(450);
  await shot('03-startmenu-700ms');
  frameStart = await ev(FRAME_STOP);
  metrics.startMenuOpenFrames = frameStart;
  metrics.startMenu = await ev(`(() => {
    const cands=['#startMenu','#launchpad','#smTileMenu','#start-menu'].map(s=>document.querySelector(s)).filter(e=>{if(!e) return false; const q=e.getBoundingClientRect(); return q.width>300&&q.height>200;});
    const menu=cands[0]||document.getElementById('startMenu')||document.getElementById('start-menu'); if(!menu) return null;
    const r=menu.getBoundingClientRect(); const s=getComputedStyle(menu);
    const vis=[...menu.querySelectorAll('*')].filter(el=>{const q=el.getBoundingClientRect(); return q.width>1&&q.height>1;});
    const items=[...menu.querySelectorAll('.start-app,.start-all-app-row,.dock-item,.launchpad-item,.app-item,.start-menu-item')].filter(el=>{const q=el.getBoundingClientRect();return q.width>1&&q.height>1;});
    const ir=items.map(el=>el.getBoundingClientRect());
    const heights=ir.map(x=>+x.height.toFixed(1));
    return {rect:[+r.x.toFixed(0),+r.y.toFixed(0),+r.width.toFixed(0),+r.height.toFixed(0)],padding:s.padding,gap:s.gap,borderRadius:s.borderRadius,boxShadow:s.boxShadow,elementCount:vis.length,itemCount:items.length,itemHeights:[...new Set(heights)].slice(0,10)};
  })()`);
  await ev(`(()=>{ ${closeStart}; return true; })()`);
  await sleep(400);

  // 4) 设置
  await ev(FRAME_START);
  await ev(`(()=>{ window.openApp?openApp('settings'):WindowManager.openApp('settings'); return true; })()`);
  await sleep(60);
  anims.settingsOpen = await ev(ANIM_SNAP);
  await sleep(700);
  await shot('04-settings');
  metrics.settingsFrames = await ev(FRAME_STOP);
  metrics.settings = await ev(`(() => {
    const panel=document.getElementById('settingsPanel')||document.querySelector('.settings-panel')||document.querySelector('[data-app="settings"]');
    if(!panel) return null;
    const r=panel.getBoundingClientRect(); const s=getComputedStyle(panel);
    const rows=[...panel.querySelectorAll('.setting-row,.settings-row,.n26-row,.settings-item')].filter(el=>{const q=el.getBoundingClientRect();return q.height>1;});
    const hr=rows.map(el=>+el.getBoundingClientRect().height.toFixed(1));
    return {rect:[+r.x.toFixed(0),+r.y.toFixed(0),+r.width.toFixed(0),+r.height.toFixed(0)],padding:s.padding,gap:s.gap,fontSize:s.fontSize,rowCount:rows.length,rowHeights:[...new Set(hr)].slice(0,8)};
  })()`);

  // 5) 计算器窗口（窗口入场）
  await ev(FRAME_START);
  await ev(`(()=>{ window.openApp?openApp('calculator'):WindowManager.openApp('calculator'); return true; })()`);
  await sleep(50);
  anims.windowOpen = await ev(ANIM_SNAP);
  await sleep(700);
  await shot('05-calculator');
  metrics.windowFrames = await ev(FRAME_STOP);
  metrics.calcWindow = await ev(`(() => {
    const wins=[...document.querySelectorAll('.window,.n26-window')].filter(el=>{const r=el.getBoundingClientRect();return r.width>1;});
    const w=wins[wins.length-1]; if(!w) return null; const r=w.getBoundingClientRect(); const s=getComputedStyle(w);
    const title=w.querySelector('.window-title,.window-header,.titlebar,.n26-window-title');
    return {rect:[+r.x.toFixed(0),+r.y.toFixed(0),+r.width.toFixed(0),+r.height.toFixed(0)],borderRadius:s.borderRadius,boxShadow:s.boxShadow,padding:s.padding,titleHeight:title?+title.getBoundingClientRect().height.toFixed(1):null,windowCount:wins.length};
  })()`);

  // 6) 控制中心
  const ccOpen = side === 'fluent' ? `ControlCenter.toggle()` : `toggleControlCenter()`;
  await ev(FRAME_START);
  await ev(`(()=>{ ${ccOpen}; return true; })()`);
  await sleep(60);
  anims.controlCenterOpen = await ev(ANIM_SNAP);
  await sleep(500);
  await shot('06-controlcenter');
  metrics.ccFrames = await ev(FRAME_STOP);
  metrics.controlCenter = await ev(`(() => {
    const cc=document.querySelector('.control-center,.control-center-panel,#control-center,.cc-panel,#ccPanel'); if(!cc) return null;
    const r=cc.getBoundingClientRect(); const s=getComputedStyle(cc);
    const tiles=[...cc.querySelectorAll('.control-tile,.cc-tile,.quick-toggle')].filter(el=>{const q=el.getBoundingClientRect();return q.width>1;});
    return {rect:[+r.x.toFixed(0),+r.y.toFixed(0),+r.width.toFixed(0),+r.height.toFixed(0)],padding:s.padding,gap:s.gap,tileCount:tiles.length,tileRects:tiles.slice(0,8).map(el=>{const q=el.getBoundingClientRect();return [+q.width.toFixed(0),+q.height.toFixed(0)]})};
  })()`);

  metrics.anims = anims;
  fs.writeFileSync(path.join(OUT, `runtime-${side}.json`), JSON.stringify(metrics, null, 2));
  console.log(side, 'done', JSON.stringify({desktop:metrics.desktop, startFrames:metrics.startMenuOpenFrames, settingsFrames:metrics.settingsFrames, windowFrames:metrics.windowFrames, ccFrames:metrics.ccFrames}).slice(0,1200));

  cdp.close();
  try { proc.kill(); } catch (_) {}
}

(async () => {
  const side = process.argv[2];
  const port = Number(process.argv[3] || 9333);
  if (!TARGETS[side]) throw new Error('bad side');
  await run(side, port);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
