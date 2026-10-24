export const FONT_JP = "'Dela Gothic One', 'Hiragino Sans', sans-serif";
export const FONT_EN = "'Cinzel', 'Times New Roman', serif";
export const FONT_NUM = "'Oswald', 'Arial Narrow', sans-serif";

export const GOLD = "#E9C46A";
export const GOLD_LIGHT = "#FFF1BF";
export const GOLD_DARK = "#8A5A12";

/** 金属っぽい金のグラデーション（文字・枠用） */
export const GOLD_GRADIENT =
  "linear-gradient(180deg, #FFF6D5 0%, #F7D98A 22%, #D9A940 46%, #8A5A12 52%, #C9962B 62%, #F3D27E 82%, #FFF1BF 100%)";

export const GOLD_GRADIENT_H =
  "linear-gradient(90deg, #8A5A12 0%, #D9A940 20%, #FFF1BF 50%, #D9A940 80%, #8A5A12 100%)";

export const formatChips = (n: number) => Math.round(n).toLocaleString("en-US");
