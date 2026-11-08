# Nexus OS 26 · 语言 / 玻璃 分发覆盖审计

> 生成于 verify-i18n.js 静态扫描。总线已通；核心应用(music/video/image)已全量双语+玻璃跟随。

## 总线状态

| 项 | 状态 |
|---|---|
| broadcastLanguage | ✓ |
| init language ctx | ✓ |
| init glass ctx | ✓ |
| 玻璃广播 | ✓ |
| _bridge 重派发 | ✓ |
| _app.js 监听 | ✓ |

## 应用清单

| 应用 | 运行时 | 双语 i18n | 玻璃跟随 | 状态 |
|---|---|---|---|---|
| `agent.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `alarm.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `calculator.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `colorlab.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `duolingo.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `fangwork.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `float/.build/out/web.html` | ✗ | ✗ | ✗ | ⚪ 未接运行时 |
| `float/index.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `floatapp/index.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `focus.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `game2048.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `games.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `image.html` | ✓ | ✓ | ✓ | ✅ 全量 |
| `monitor.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `music.html` | ✓ | ✓ | ✓ | ✅ 全量 |
| `necta/index.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `novel.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `pomodoro.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `quicknote.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `reelix/index.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `screenshot.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `strata/index.html` | ✓ | ✗ | ✓ | 🔸 仅接总线，待补 |
| `terminal.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `tips.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `video.html` | ✓ | ✓ | ✓ | ✅ 全量 |
| `vm.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |
| `weather.html` | ✓ | ✗ | ✗ | 🔸 仅接总线，待补 |

## 待补清单（按优先级）

1. **核心 3 个**：music / video / image —— 已完成。
2. **高频工具类**（建议下一批）：calculator, terminal, weather, monitor, quicknote, alarm, pomodoro, focus, screenshot, colorlab, game2048, novel, duolingo, tips, agent。
3. **大应用**（各自有多文件/独立壳）：fangwork, float, floatapp, necta, reelix, strata, games, vm。

每个待补应用需要：① 在 HTML 加 `data-i18n*` 静态属性 + 定义 `window.APP_I18N={zh,en}`；② 动态串用 `T()`；③ 玻璃 CSS 改为 `blur(var(--glass-blur, Npx))` 并补 `body.mat-solid` 覆盖。运行时(_app.js)已自动接好事件，无需再改桥。
