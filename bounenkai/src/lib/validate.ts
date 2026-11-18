// 入力チェック（画面とサーバーで同じものを使う）

/** 電話番号を整える：全角→半角、空白・括弧・ハイフン類を取り除き、+81 は 0 にする */
export function normalizePhone(raw: string): string {
  let s = raw.trim().replace(/[０-９＋]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[\s()（）\-－ー‐−‑–—]/g, "");
  if (s.startsWith("+81")) s = `0${s.slice(3).replace(/^0/, "")}`;
  return s;
}

/** 日本の電話番号（0から始まる10〜11桁） */
export function isValidPhone(raw: string): boolean {
  return /^0\d{9,10}$/.test(normalizePhone(raw));
}

/** メールアドレス（古い携帯の「abc.@docomo.ne.jp」のような形も通すゆるい判定） */
export function isValidEmail(raw: string): boolean {
  const s = raw.trim();
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(s);
}

/** 保存・通知用の表記。携帯（070/080/090）は 090-1234-5678 の形、それ以外は数字のまま */
export function formatPhone(raw: string): string {
  const s = normalizePhone(raw);
  const m = s.match(/^(0[789]0)(\d{4})(\d{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}
