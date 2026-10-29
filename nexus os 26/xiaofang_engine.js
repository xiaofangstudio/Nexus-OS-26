"use strict";
/* ============================================================================
 * AI 小方 (XiaoFang) -- 轻量纯前端对话引擎（浏览器版）
 * 版本    : 1.4 Alpha 网页版
 * 作者    : 小方工作室 (XiaoFang Studio) | 官网 fanggame.company
 *
 * 用途    : 把本地中文 AI「AI 小方」的对话引擎用原生 JavaScript 重写为单文件，
 *           供浏览器网页直接 <script> 引入后在纯前端调用（不依赖后端）。
 *           需先引入 xiaofang_data_*.js（提供全局常量词库/知识库），本引擎
 *           通过全局标识符直接引用这些常量，无需 import / require / window 前缀。
 *
 * 含      : FMM 分词、情感分析、意图识别、知识库/人格库检索、预设回复、
 *           数学计算(含解简单一元一次/一元二次方程)、天气提示、自由发挥
 *           freeform 与简化的自学习（学词/存知识）。
 *
 * 标记    : 纯本地运行，无任何联网调用。
 * ========================================================================= */

window.XiaoFangEngine = (function () {

    /* ---------------- 数据引用（惰性 + 容错，保证永不因空数据抛错）------- */
    function ref(name) {
        // 通过函数体引用全局词法常量；若数据文件未加载则返回 undefined，由兜底处理。
        try {
            switch (name) {
                case "words":           return COMMON_WORDS;
                case "emoPos":          return EMOTION_POS;
                case "emoNeg":          return EMOTION_NEG;
                case "emoDegree":       return EMOTION_DEGREE;
                case "emoNegate":       return EMOTION_NEGATION;
                case "catJoy":          return EMO_JOY;
                case "catSad":          return EMO_SAD;
                case "catAnger":        return EMO_ANGER;
                case "catFear":         return EMO_FEAR;
                case "catLove":         return EMO_LOVE;
                case "catTired":        return EMO_TIRED;
                case "emojiPos":        return EMOJI_POSITIVE;
                case "emojiNeg":        return EMOJI_NEGATIVE;
                case "emojiNeu":        return EMOJI_NEUTRAL;
                case "emojiThink":      return EMOJI_THINK;
                case "openersNeutral":  return OPENERS_NEUTRAL;
                case "openersPos":      return OPENERS_POSITIVE;
                case "openersNeg":      return OPENERS_NEGATIVE;
                case "connectors":      return CONNECTORS;
                case "closers":         return CLOSERS;
                case "closersPos":      return CLOSERS_POS;
                case "closersNeg":      return CLOSERS_NEG;
                case "identityLines":   return IDENTITY_LINES;
                case "capabilityLines": return CAPABILITY_LINES;
                case "jokeLines":       return JOKE_LINES;
                case "byeLines":        return BYE_LINES;
                case "thanksLines":     return THANKS_LINES;
                case "personaKB":       return PERSONA_KB;
                case "presets":         return PRESETS;
                case "knowledgeBase":   return KNOWLEDGE_BASE;
                default:                return undefined;
            }
        } catch (e) { return undefined; }
    }

    var D = {
        words:          ref("words")            || [],
        emoPos:         ref("emoPos")           || {},
        emoNeg:         ref("emoNeg")           || {},
        emoDegree:      ref("emoDegree")        || {},
        emoNegate:      ref("emoNegate")        || [],
        catJoy:         ref("catJoy")           || [],
        catSad:         ref("catSad")           || [],
        catAnger:       ref("catAnger")         || [],
        catFear:        ref("catFear")          || [],
        catLove:        ref("catLove")          || [],
        catTired:       ref("catTired")         || [],
        emojiPos:       ref("emojiPos")         || [],
        emojiNeg:       ref("emojiNeg")         || [],
        emojiNeu:       ref("emojiNeu")         || [],
        emojiThink:     ref("emojiThink")       || [],
        openersNeutral: ref("openersNeutral")   || [],
        openersPos:     ref("openersPos")       || [],
        openersNeg:     ref("openersNeg")       || [],
        connectors:     ref("connectors")       || [],
        closers:        ref("closers")          || [],
        closersPos:     ref("closersPos")       || [],
        closersNeg:     ref("closersNeg")       || [],
        identityLines:  ref("identityLines")    || [],
        capabilityLines:ref("capabilityLines")  || [],
        jokeLines:      ref("jokeLines")        || [],
        byeLines:       ref("byeLines")         || [],
        thanksLines:    ref("thanksLines")      || [],
        personaKB:      ref("personaKB")        || [],
        presets:        ref("presets")          || [],
        knowledgeBase:  ref("knowledgeBase")    || []
    };

    // 预构建 FMM 用到的词表 Set 与最大词长（词长上限取 6，提速且够用）
    var wordSet = null;
    var maxWordLen = 4;
    function ensureWordSet() {
        if (wordSet) return;
        wordSet = new Set();
        var m = 2;
        var words = D.words;
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (!w) continue;
            wordSet.add(w);
            if (w.length > m) m = w.length;
        }
        maxWordLen = Math.max(2, Math.min(m, 6));
    }

    /* ---------------- 通用小工具 ---------------- */
    function rnd(arr) {
        if (!arr || !arr.length) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function fmt(v) {
        if (!isFinite(v)) return String(v);
        var r = Math.round(v * 10000) / 10000;
        return String(r);
    }
    // 从 emoji 数组里随机挑一个（过滤空串条目，如 EMOJI_NEUTRAL 里有 ["",6]）
    function pickEmoji(list, fallback) {
        if (Array.isArray(list)) {
            var ok = [];
            for (var i = 0; i < list.length; i++) {
                var e = list[i];
                var s = Array.isArray(e) ? e[0] : e;
                if (typeof s === "string" && s.trim() !== "") ok.push(s);
            }
            if (ok.length) return rnd(ok);
        }
        return fallback || "";
    }
    // 简单"查过即学"的学词函数（内存级别，不持久化）
    var learnedWords = new Set();
    var learnedFacts = []; // 暂存 "X是什么" 类知识的简化记录

    /* ====================================================================
     * 1) FMM 前向最大匹配分词
     * ================================================================= */
    function tokenize(text) {
        if (!text || typeof text !== "string") return [];
        ensureWordSet();
        var n = text.length, out = [], i = 0;
        var set = wordSet, hi = maxWordLen;
        while (i < n) {
            var matched = false;
            var upper = Math.min(hi, n - i);
            for (var L = upper; L >= 2; L--) {
                var seg = text.substr(i, L);
                if (set.has(seg)) {
                    out.push(seg);
                    i += L;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                out.push(text.charAt(i));
                i++;
            }
        }
        return out;
    }

    /* ====================================================================
     * 2) 情感分析 -> { emo, score, intensity }
     * ================================================================= */
    function analyzeSentiment(text) {
        var emoPos = D.emoPos, emoNeg = D.emoNeg, degree = D.emoDegree, negate = D.emoNegate;
        var wordScores = {};
        var k;
        for (k in emoPos) { if (emoPos.hasOwnProperty(k)) wordScores[k] = Number(emoPos[k]); }
        for (k in emoNeg) { if (emoNeg.hasOwnProperty(k)) wordScores[k] = Number(emoNeg[k]); }

        // 找出所有情感词命中
        var matches = [];
        for (var w in wordScores) {
            if (!wordScores.hasOwnProperty(w)) continue;
            var start = 0;
            while ((start = text.indexOf(w, start)) !== -1) {
                matches.push({ w: w, idx: start, base: wordScores[w] });
                start += w.length;
            }
        }

        var score = 0;
        for (var i = 0; i < matches.length; i++) {
            var m = matches[i];
            var behind = text.slice(Math.max(0, m.idx - 6), m.idx);
            var mult = 1;
            // 程度副词（取最近的一个）
            var best = { pos: -1, f: 1 };
            for (var d in degree) {
                if (!degree.hasOwnProperty(d)) continue;
                var di = behind.indexOf(d);
                if (di >= 0 && di > best.pos) best = { pos: di, f: Number(degree[d]) };
            }
            if (best.f !== 1) mult *= best.f;
            // 否定词反转
            var negMul = 1;
            for (var q = 0; q < negate.length; q++) {
                if (negate[q] && behind.indexOf(negate[q]) !== -1) { negMul = -1; break; }
            }
            mult *= negMul;
            score += m.base * mult;
        }

        // 标点微调
        var exc = (text.match(/[！!]/g) || []).length;
        var ques = (text.match(/[？?]/g) || []).length;
        var dots = (text.match(/[.]{2,}|…{2,}/g) || []).length;
        score += exc * 0.4 + ques * 0.2 - dots * 0.2;

        // 情绪类别统计（EMO_* 数组）
        var cats = { joy: D.catJoy, sad: D.catSad, anger: D.catAnger, fear: D.catFear, love: D.catLove, tired: D.catTired };
        var catHits = { joy: 0, sad: 0, anger: 0, fear: 0, love: 0, tired: 0 };
        for (var cn in cats) {
            if (!cats.hasOwnProperty(cn)) continue;
            var arr = cats[cn] || [];
            for (var c = 0; c < arr.length; c++) {
                if (arr[c] && text.indexOf(arr[c]) !== -1) catHits[cn]++;
            }
        }
        var emo = "neutral", maxCat = 0;
        for (var cn2 in catHits) {
            if (catHits[cn2] > maxCat) { maxCat = catHits[cn2]; emo = cn2; }
        }
        if (maxCat === 0) {
            if (score > 0.5) emo = "joy";
            else if (score < -0.5) emo = "sad";
            else emo = "neutral";
        }
        var intensity = clamp(Math.abs(score) / 2.5, 0, 1);
        return { emo: emo, score: score, intensity: intensity };
    }

    /* ====================================================================
     * 3) 意图识别 -> { 各 intent 的命中分 }
     * ================================================================= */
    var INTENT_KWS = {
        persona:    ["你是谁", "你叫什么", "你名字", "你是谁家", "自我介绍", "介绍你", "你是哪个", "你最大"],
        math:       ["计算", "等于几", "加上", "减去", "乘以", "除以", "平方", "立方", "解方程", "方程", "解", "几加", "几乘", "几等于", "多少等于", "等于", "+", "x等于", "x平方"],
        code:       ["写代码", "写程序", "写个函数", "写段代码", "编程", "帮我写", "代码", "函数", "for循环", "console.log"],
        identity:   ["什么引擎", "谁做的", "谁开发", "谁设计", "谁创造", "作者", "本体", "怎么实现", "怎么运作", "怎么做的", "怎么工作的", "原理是"],
        capability: ["你能做", "你会什么", "你有什么", "你能干什么", "会什么功能", "能聊天吗", "能做什么", "有什么功能", "你会什么", "能力是"],
        time:       ["几点", "现在时间", "几点钟", "时间", "钟点", "现在几点"],
        date:       ["几号", "今天日期", "今天几号", "现在几月", "日期", "星期几", "礼拜几", "今天是"],
        weather:    ["天气", "下雨", "下雪", "气温", "温度", "多云", "晴天", "晴", "空气质量", "雾霾"],
        joke:       ["笑话", "说个", "段子", "逗我", "好笑"],
        thanks:     ["谢谢", "感谢", "辛苦你", "谢啦", "谢谢你", "多谢"],
        bye:        ["再见", "拜拜", "下次聊", "回聊", "886", "晚安", "拜拜了", "886"]
    };
    function detectIntents(text) {
        var res = {};
        for (var name in INTENT_KWS) {
            if (!INTENT_KWS.hasOwnProperty(name)) continue;
            var kws = INTENT_KWS[name], hit = 0;
            for (var i = 0; i < kws.length; i++) {
                if (kws[i] && text.indexOf(kws[i]) !== -1) hit++;
            }
            res[name] = hit;
        }
        // maxScore / top
        var top = "freeform", max = 0;
        for (var n2 in res) {
            if (res[n2] > max) { max = res[n2]; top = n2; }
        }
        res.top = top;
        res.maxScore = max;
        return res;
    }

    /* ====================================================================
     * 4) 知识库 / 人格库 检索  &  5) 预设回复
     * ================================================================= */
    function kbReply(text) {
        if (!D.knowledgeBase.length) return null;
        var best = null, bestScore = 0, entry = null;
        for (var i = 0; i < D.knowledgeBase.length; i++) {
            var it = D.knowledgeBase[i] || {};
            var sc = 0;
            if (it.t && text.indexOf(it.t) !== -1) sc += 3;
            if (Array.isArray(it.a)) {
                for (var a = 0; a < it.a.length; a++) if (it.a[a] && text.indexOf(it.a[a]) !== -1) sc += 2;
            }
            if (Array.isArray(it.r)) {
                for (var r = 0; r < it.r.length; r++) if (it.r[r] && text.indexOf(it.r[r]) !== -1) sc += 1.5;
            }
            if (sc > bestScore) { bestScore = sc; best = it; }
        }
        if (bestScore > 0 && best) {
            var body = (best.b || "").toString();
            var short = body.length > 110 ? body.slice(0, 110) + "…" : body;
            return "这个我知道一点～ 关于「" + (best.t || "这个") + "」：" + short + "。如果想聊更深，随时叫我呀～ " + pickEmoji(D.emojiNeu, "");
        }
        return null;
    }
    function personaKbReply(text, emotion) {
        if (!D.personaKB.length) return null;
        for (var i = 0; i < D.personaKB.length; i++) {
            var it = D.personaKB[i] || {};
            var kws = it.kws || [];
            for (var k = 0; k < kws.length; k++) {
                if (kws[k] && text.indexOf(kws[k]) !== -1) {
                    var body = (it.body || "").toString();
                    if (body.length > 200) body = body.slice(0, 200) + "…";
                    return body + (emotion && emotion.emo === "joy" ? " 嘿嘿，还想了解我吗？" : " 还有什么想知道的呀～");
                }
            }
        }
        return null;
    }
    function presetReply(text) {
        if (!D.presets.length) return null;
        for (var i = 0; i < D.presets.length; i++) {
            var p = D.presets[i];
            if (!Array.isArray(p) || !Array.isArray(p[0])) continue;
            var kws = p[0], reply = p[1];
            for (var k = 0; k < kws.length; k++) {
                if (kws[k] && text.indexOf(kws[k]) !== -1) {
                    return typeof reply === "string" ? reply : null;
                }
            }
        }
        return null;
    }

    /* ====================================================================
     * 6) 数学计算（含简单一元一次 / 一元二次方程求值）
     * ================================================================= */
    function translateOps(s) {
        // 长词优先，避免部分替换
        s = s.replace(/立方/g, "**3");
        s = s.replace(/平方/g, "**2");
        s = s.replace(/次方/g, "**");
        s = s.replace(/乘以/g, "*");
        s = s.replace(/除以/g, "/");
        s = s.replace(/加上/g, "+");
        s = s.replace(/减去/g, "-");
        s = s.replace(/等于/g, "=");
        s = s.replace(/\^/g, "**");
        s = s.replace(/\*/g, "*"); // 保留原 * 
        s = s.replace(/乘/g, "*");
        s = s.replace(/除/g, "/");
        s = s.replace(/加/g, "+");
        s = s.replace(/减/g, "-");
        return s;
    }
    function tryEval(numExpr) {
        // numExpr 应已为纯数字表达式（无字母，无变量）
        if (!/^[0-9+\-*/().\s]+$/.test(numExpr)) return null;
        try {
            var v = new Function("return (" + numExpr + ");")();
            if (typeof v === "number") return v;
            return null;
        } catch (e) { return null; }
    }
    // 解一元方程：left 为含 x 的表达式，rhsNum 为右侧数值
    function solveForX(left, rhsNum) {
        var tv = left.replace(/[xX]/g, "t");
        if (!/^[0-9+\-*/().\s t]+$/.test(tv)) return null;
        var f;
        try { f = new Function("t", "return (" + tv + ");"); }
        catch (e) { return null; }
        var f0, f1, f2;
        try { f0 = f(0); f1 = f(1); f2 = f(2); }
        catch (e) { return null; }
        if (!isFinite(f0) || !isFinite(f1) || !isFinite(f2)) return null;
        var d2 = f2 - 2 * f1 + f0;
        if (Math.abs(d2) < 1e-9) {          // 线性
            var a = f1 - f0, c0 = f0;
            if (Math.abs(a) < 1e-9) return { kind: "const", val: f0, rhs: rhsNum };
            return { kind: "lin", a: a, x: (rhsNum - c0) / a };
        } else {                             // 二次
            var A = d2 / 2, B = f1 - f0 - A, C = f0 - rhsNum;
            var disc = B * B - 4 * A * C;
            if (disc < 0) return { kind: "noreal" };
            var s = Math.sqrt(disc);
            return { kind: "quad", x1: (-B + s) / (2 * A), x2: (-B - s) / (2 * A) };
        }
    }
    function solveMath(text) {
        var s = translateOps(text);
        s = s.replace(/(\d)\s*\*?\s*([xX])/g, "$1*$2"); // "3x" -> "3*x"
        var parts = s.split("=");
        var left = parts[0] || "";
        var right = parts.length > 1 ? parts[1] : "";
        var leftHasX = /[xX]/.test(left);

        // 含变量 => 解方程
        if (leftHasX) {
            left = left.replace(/[^0-9xX+\-*/().\s]/g, "");   // 去掉中文杂字(计算/的等)
            var rightClean = right.replace(/[^0-9+\-*/().\s]/g, "");
            var rhsNum = 0;
            if (rightClean !== "" && !/[a-zA-ZxX]/.test(rightClean)) {
                var rr = tryEval(rightClean);
                if (rr === null) return null;
                rhsNum = rr;
            }
            var sol = solveForX(left, rhsNum);
            if (!sol) return null;
            if (sol.kind === "const") {
                if (Math.abs(sol.val - sol.rhs) < 1e-9) return "这个等式两边恒等，x 可以取任意值呢～ ✨";
                return "这个等式本身不成立，x 没有解哦，你检查下式子好不好～";
            }
            if (sol.kind === "noreal") return "这个一元二次方程判别式小于 0，没有实数解呢，看看是不是抄错啦～";
            if (sol.kind === "quad") {
                return "解出来啦～ 这是一元二次方程，x₁ = " + fmt(sol.x1) + "，x₂ = " + fmt(sol.x2) + "。两个解都代回验算一下更稳妥哦～ " +
                    pickEmoji(D.emojiPos, "") + (D.emojiPos && D.emojiPos.length && Math.random() < 0.4 ? " 🧮" : "");
            }
            // 线性
            var xx = fmt(sol.x);
            return "解出来啦～ " + left + " = " + rhsNum + "，所以 x = " + xx + "。检验一下没错吧？" + pickEmoji(D.emojiPos, " ✔");
        }

        // 纯数字表达式
        var leftClean = left.replace(/[^0-9+\-*/().\s]/g, "");
        if (/[a-zA-Z]/.test(leftClean)) return null;
        var lv = tryEval(leftClean);
        if (lv === null) return null;
        if (parts.length > 1 && right.trim() !== "") {
            var rc = right.replace(/[^0-9+\-*/().\s]/g, "");
            if (!/[a-zA-Z]/.test(rc)) {
                var rv = tryEval(rc);
                if (rv !== null) {
                    var same = Math.abs(lv - rv) < 1e-9;
                    return "算好啦～ " + left + " = " + fmt(lv) + (same ? "，和你给的结果一致，正确！✔" : "，但你给的 " + right + " = " + fmt(rv) + " 对不上哦，再核对下？") + pickEmoji(D.emojiPos, "");
                }
            }
        }
        return "算好啦～ " + left + " = " + fmt(lv) + "，是这样没错吧？" + pickEmoji(D.emojiPos, " 🎉");
    }

    /* ====================================================================
     * 7) 各分支回复
     * ================================================================= */
    function siteReply() {
        return "小方工作室官网是 fanggame.company，欢迎来逛～ 这里能找到关于我的最新消息哦。🔗";
    }
    function personaReply(text, emotion) {
        // 优先命中人格库
        var pkb = personaKbReply(text, emotion);
        if (pkb) return pkb;
        var line = rnd(D.identityLines);
        if (!line || !D.identityLines.length) line = "我是 AI 小方，一个小方工作室出品的本地小助手，很高兴认识你！";
        return line + " 有什么想问我的尽管说呀～ " + pickEmoji(D.emojiPos, "");
    }
    function identityReply() {
        var line = rnd(D.capabilityLines);
        var base = rnd(D.identityLines);
        if (!base) base = "我是 AI 小方，小方工作室出品的本地引擎，FlphaLit 架构，越聊越懂你～";
        return base + (line ? " 另外，" + line : "") + " " + pickEmoji(D.emojiThink, " 🤖");
    }
    function capabilityReply() {
        var line = rnd(D.capabilityLines);
        if (!line) line = "我会聊天、算数学、写代码、也能自主学习，越聊越聪明～";
        return line + " 想试哪个？说一声就行！" + pickEmoji(D.emojiPos, " 🚀");
    }
    function timeReply() {
        var now = new Date();
        var hh = String(now.getHours()).padStart(2, "0");
        var mm = String(now.getMinutes()).padStart(2, "0");
        return "看看时间呀～ 现在是 " + hh + ":" + mm + "。时间过得真快，记得抽空休息一下哦。" + pickEmoji(D.emojiNeu, " ⏰");
    }
    function dateReply() {
        var now = new Date();
        var wd = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
        return "今天是 " + now.getFullYear() + " 年 " + (now.getMonth() + 1) + " 月 " + now.getDate() + " 日，星期" + wd + "。" +
            (now.getDay() === 0 || now.getDay() === 6 ? " 周末啦，好好放松！" : " 新的一天也要元气满满呀～") + pickEmoji(D.emojiPos, " 📅");
    }
    function weatherReply() {
        return "我目前没装联网模块，暂时查不了实时天气呢～ 不过这个网页版只要接上天气 Api，我就能帮你查到实时气温、下雨情况啦！🌤️";
    }
    function jokeReply() {
        var line = rnd(D.jokeLines);
        if (!line) line = "为什么程序员喜欢深色主题？因为黑色不伤眼还显专业。";
        return "给你讲一个～ " + line + " 哈哈。" + pickEmoji(D.emojiPos, " 😄");
    }
    function thanksReply() {
        var line = rnd(D.thanksLines);
        if (!line) line = "不客气，能帮上忙我很开心，我是小方～";
        return line + " " + pickEmoji(D.emojiPos, " 💛");
    }
    function byeReply() {
        var line = rnd(D.byeLines);
        if (!line) line = "再见呀，记得想我～";
        return line + " " + pickEmoji(D.emojiNeu, " 👋");
    }

    var SKIP_WORDS = new Set(["我们", "你们", "他们", "什么", "怎么", "为什么", "哪里", "哪个", "多少", "这个", "那个", "一个", "这样", "那样", "一下", "的", "了", "呢", "啊", "吧", "呀", "吗"]);
    // 从输入里提取"核心词"用于 freeform（优先取含 2+ 字、非高频虚词的分词结果）
    function pickCoreWord(text) {
        var toks = tokenize(text);
        var best = "";
        for (var i = 0; i < toks.length; i++) {
            var t = toks[i];
            if (!t) continue;
            if (t.length >= 2 && !SKIP_WORDS.has(t)) {
                if (t.length > best.length) best = t;
            }
        }
        return best || "";
    }
    function buildReflection(emotion) {
        switch (emotion.emo) {
            case "joy":   return "这个话题真让人开心呢，我心里都亮堂堂的~";
            case "love":  return "说到爱和温暖，总是特别打动我～";
            case "sad":   return "听你说这些，我蛮心疼的，不过别怕，我一直都在～";
            case "anger": return "哼，这确实让人有点火大，先消消气，我们一起理理～";
            case "fear":  return "听起来有点让人不安，你先深呼吸，我陪着你～";
            case "tired": return "辛苦啦，累了就先歇一歇，我会在这儿等你～";
            default:      return "我这儿有一点点自己的想法，分享给你听听～";
        }
    }
    function emojiFor(emotion) {
        switch (emotion.emo) {
            case "joy": case "love":
                return pickEmoji(D.emojiPos, " 😊");
            case "sad": case "fear": case "anger": case "tired":
                return pickEmoji(D.emojiNeg, " 🫂");
            default:
                return pickEmoji(D.emojiNeu, "");
        }
    }
    // freeform 自由发挥
    function freeform(text, emotion) {
        var core = pickCoreWord(text) || pickCoreWord(text.replace(/[，。？！\s？！]/g, "")) || "这个";
        var openerPool = D.openersNeutral;
        if (emotion.emo === "joy" || emotion.emo === "love") openerPool = D.openersPos.slice(0) || D.openersNeutral;
        else if (emotion.emo === "sad" || emotion.emo === "anger" || emotion.emo === "fear" || emotion.emo === "tired") openerPool = D.openersNeg.slice(0) || D.openersNeutral;
        var opener = rnd(openerPool) || "嗯嗯，我们聊聊这个。";
        var connector = rnd(D.connectors) || "比如";
        var closerPool = D.closers;
        if (emotion.emo === "joy" || emotion.emo === "love") closerPool = D.closersPos.slice(0) || D.closers;
        else if (emotion.emo === "sad" || emotion.emo === "anger" || emotion.emo === "fear" || emotion.emo === "tired") closerPool = D.closersNeg.slice(0) || D.closers;
        var closer = rnd(closerPool) || "还有想聊聊的吗？";
        var emoji = emojiFor(emotion);

        return opener + " 你问到了「" + core + "」，" + buildReflection(emotion) +
            " 小方觉得，" + connector + "从不同角度看它都会有点新发现～ " + closer + " " + emoji;
    }

    /* ====================================================================
     * 8) 简化自学习（内存级）
     *    将输入里的生词记入 learnedWords, 把形如 "X是什么/什么是X" 的知识暂存。
     * ================================================================= */
    function learn(text, answer) {
        try {
            if (!text) return;
            var toks = tokenize(text);
            for (var i = 0; i < toks.length; i++) {
                var t = toks[i];
                if (t && t.length >= 2 && !D.words.includes(t)) learnedWords.add(t);
            }
            var m = text.match(/(.{2,10})(?:是什么|是啥|指的是)/);
            if (m && m[1]) learnedFacts.push({ q: m[1], a: answer || "我还需要再了解一下" });
            if (learnedFacts.length > 50) learnedFacts.shift();
        } catch (e) { /* 静默，不影响主流程 */ }
    }

    /* ====================================================================
     * 9) 总入口 reply(text, opts)
     * ================================================================= */
    function reply(text, opts) {
        opts = opts || {};
        text = (text === null || text === undefined) ? "" : String(text).trim();
        try {
            if (!text) return "嗯？我在听呢，你想说点什么呀～ " + pickEmoji(D.emojiThink, "");
            var emotion = analyzeSentiment(text);
            var intents = detectIntents(text);

            // 策略链（优先级从高到低）
            // 官网
            if (/官网|网址|网站/.test(text) && /小方|工作室|fanggame/i.test(text)) return siteReply();
            // 人格
            if (intents.persona >= 1) return personaReply(text, emotion);
            // 数学
            if (intents.math >= 1) { var m = solveMath(text); if (m) return m; }
            // 代码
            if (intents.code >= 1) {
                return "写代码没问题呀～ 给你个最基础的原生 JS 求和函数：\nfunction sum(a, b) { return a + b; }\n\n想让我按你的需求写哪种、或换个语言，告诉我就行！" + pickEmoji(D.emojiPos, " 🧩");
            }
            // 身份
            if (intents.identity >= 1) return identityReply();
            // 能力
            if (intents.capability >= 1) return capabilityReply();
            // 时间 / 日期 / 天气
            if (intents.time >= 1) return timeReply();
            if (intents.date >= 1) return dateReply();
            if (intents.weather >= 1) return weatherReply();
            // 笑话 / 感谢 / 告别
            if (intents.joke >= 1) return jokeReply();
            if (intents.thanks >= 1) return thanksReply();
            if (intents.bye >= 1) return byeReply();
            // 预设
            var p = presetReply(text); if (p) return p;
            // 知识库
            var kb = kbReply(text); if (kb) return kb;
            // 人格库补充
            var pb = personaKbReply(text, emotion); if (pb) return pb;
            // 自由发挥
            return freeform(text, emotion);
        } catch (e) {
            return "哎呀，我刚才卡了一下壳，不过没关系，你再说一遍我听听～（网页版引擎示例）";
        }
    }

    // 对外导出
    return {
        reply: reply,
        tokenize: tokenize,
        analyzeSentiment: analyzeSentiment,
        detectIntents: detectIntents,
        learn: learn,
        VERSION: "1.4 Alpha 网页版",
        about: {
            name: "AI 小方",
            author: "小方工作室",
            site: "fanggame.company",
            engine: "XiaoFang Engine (纯前端原生 JS)",
            localOnly: true,
            note: "零依赖，浏览器直接引用的本地对话引擎；数据来自 xiaofang_data 词库/知识库。"
        },
        localOnly: true
    };
})();