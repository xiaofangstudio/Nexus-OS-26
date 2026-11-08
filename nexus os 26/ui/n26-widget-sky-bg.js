/* ui/n26-widget-sky-bg.js · 由素材目录扫描生成（勿手改）
 * 6 时段 × 天气状况 → 真实存在的背景文件；缺档自动回退 sunny 同档，绝不产生 404。
 * 重新生成：node 里按 weather_quick_card_<cond>_<variant>.webp 扫 天气素材/天气/OPPO天气/天气背景/ 。
 */
/* 基址按「本脚本自身 URL」反推，不依赖页面/iframe 的文档基址：
   ui/ 在应用目录下一层，天气素材与应用目录同级，所以从脚本地址上溯两级。
   页面被挂在 /nexus os 26/ 或 / 下、或被放进 iframe，都指向同一个真实素材目录。 */
(function () {
  var FALLBACK = '../天气素材/天气/OPPO天气/天气背景/';
  window.N26_SKY_BG_BASE = FALLBACK;
  try {
    var sc = document.currentScript;
    if (sc && sc.src) window.N26_SKY_BG_BASE = new URL('../../天气素材/天气/OPPO天气/天气背景/', sc.src).href;
  } catch (e) { /* 保持相对路径兜底 */ }
})();
window.N26_SKY_BG = {
  "sunny": {
    "night": "weather_quick_card_sunny_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_sunny_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "sunning": {
    "night": "weather_quick_card_sunny_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_sunny_daytime_2x2.webp",
    "golden": "weather_quick_card_sunning_evening_big_bg.webp",
    "sunset": "weather_quick_card_sunning_evening_small_bg.webp"
  },
  "cloudy": {
    "night": "weather_quick_card_cloudy_night_2x2.webp",
    "sunrise": "weather_quick_card_cloudy_morning_2x2.webp",
    "morning": "weather_quick_card_cloudy_morning_big_bg.webp",
    "noon": "weather_quick_card_cloudy_daytime_2x2.webp",
    "golden": "weather_quick_card_cloudy_evening_big_bg.webp",
    "sunset": "weather_quick_card_cloudy_evening_2x2.webp"
  },
  "overcast": {
    "night": "weather_quick_card_overcast_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_overcast_big_bg.webp",
    "noon": "weather_quick_card_overcast_daytime_2x2.webp",
    "golden": "weather_quick_card_overcast_big_bg.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "drizzle": {
    "night": "weather_quick_card_drizzle_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_drizzle_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "rain": {
    "night": "weather_quick_card_rain_big_night_bg.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_rain_big_bg.webp",
    "noon": "weather_quick_card_rain_big_bg.webp",
    "golden": "weather_quick_card_rain_big_bg.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "fog": {
    "night": "weather_quick_card_fog_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_fog_big_bg.webp",
    "noon": "weather_quick_card_fog_daytime_2x2.webp",
    "golden": "weather_quick_card_fog_big_bg.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "haze": {
    "night": "weather_quick_card_haze_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_haze_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "hailstone": {
    "night": "weather_quick_card_hailstone_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_hailstone_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "sleet": {
    "night": "weather_quick_card_sleet_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_sleet_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "snow": {
    "night": "weather_quick_card_snow_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_snow_big_bg.webp",
    "noon": "weather_quick_card_snow_daytime_2x2.webp",
    "golden": "weather_quick_card_snow_big_bg.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "storm": {
    "night": "weather_quick_card_sunny_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_storm_dark_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "storms": {
    "night": "weather_quick_card_storms_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_storms_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "thunder": {
    "night": "weather_quick_card_thunder_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_thunder_big_bg.webp",
    "noon": "weather_quick_card_thunder_daytime_2x2.webp",
    "golden": "weather_quick_card_thunder_big_bg.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  },
  "sandstorm": {
    "night": "weather_quick_card_sandstorm_night_2x2.webp",
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_sandstorm_daytime_2x2.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "sunset": "weather_quick_card_sunny_evening_2x2.webp"
  }
};
window.N26_SKY_FALLBACK = {
  "night": "weather_quick_card_sunny_night_2x2.webp",
  "sunrise": "weather_quick_card_sunny_big_bg.webp",
  "morning": "weather_quick_card_sunny_big_bg.webp",
  "noon": "weather_quick_card_sunny_daytime_2x2.webp",
  "golden": "weather_quick_card_sunny_evening_2x2.webp",
  "sunset": "weather_quick_card_sunny_evening_2x2.webp"
};
