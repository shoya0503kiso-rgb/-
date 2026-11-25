import { IMG } from "@/lib/brand-images";

// 来店スタンプ：もちもちのロゴを赤いインクのはんこで押した絵。
// 手で押したように、日によって少しずつ傾きと位置が変わる（同じ日はいつも同じ）

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 日付（YYYY-MM-DD）から、押したときの傾き（-22〜+10度）とずれ（±4%） */
export function stampPose(date: string) {
  const h = hash(date);
  return { rotate: -22 + (h % 33), dx: ((h >>> 8) % 9) - 4, dy: ((h >>> 16) % 9) - 4 };
}

export function StampMark({ date, className = "" }: { date: string; className?: string }) {
  const p = stampPose(date);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={IMG.stampLogo}
      alt="来店スタンプ"
      className={`object-contain mix-blend-multiply ${className}`}
      style={{ transform: `translate(${p.dx}%, ${p.dy}%) rotate(${p.rotate}deg)` }}
    />
  );
}
