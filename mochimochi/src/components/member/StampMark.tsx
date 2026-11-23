import { IMG } from "@/lib/brand-images";

// 来店スタンプの絵柄。日によって変わる（同じ日はみんな同じスタンプ）

export const STAMP_KINDS = ["logo", "beer", "dart", "paw", "card", "mic", "dice"] as const;
export type StampKind = (typeof STAMP_KINDS)[number];
export const STAMP_LABEL: Record<StampKind, string> = {
  logo: "もちもち",
  beer: "ビール",
  dart: "ダーツ",
  paw: "トランプちゃんの肉球",
  card: "トランプ",
  mic: "マイク",
  dice: "サイコロ",
};

/** 日付（YYYY-MM-DD）からスタンプの絵柄を決める */
export function stampKindFor(date: string): StampKind {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 16777619);
  return STAMP_KINDS[(h >>> 0) % STAMP_KINDS.length];
}

/** スタンプの中の絵（赤いインク風） */
function Icon({ kind }: { kind: Exclude<StampKind, "logo"> }) {
  switch (kind) {
    case "beer":
      return (
        <>
          <path d="M6 9h9v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
          <path d="M15 11h2.5a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2H15v-2h2.5V13H15z" />
          <path d="M5.5 9.5a2.6 2.6 0 0 1 1.7-4.4 3.2 3.2 0 0 1 5.7-.6 2.4 2.4 0 0 1 3 3.3A1.9 1.9 0 0 1 15.5 9.5z" />
          <path d="M9 12v6M12 12v6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
        </>
      );
    case "dart":
      // 左下に刺さる向きのダーツの矢
      return (
        <g transform="rotate(-45 12 12)">
          <path d="M0.5 12L5.5 11.2v1.6z" />
          <rect x="5" y="10.3" width="7.5" height="3.4" rx="1.7" />
          <path d="M7.2 10.6v2.8M9 10.6v2.8M10.8 10.6v2.8" stroke="#fff" strokeWidth=".7" />
          <rect x="12" y="11.35" width="4.5" height="1.3" />
          <path d="M14.5 12L18.5 5.5h4.8L21.2 12zM14.5 12l4 6.5h4.8L21.2 12z" />
        </g>
      );
    case "paw":
      return (
        <>
          <path d="M12 11c3.3 0 6 3 6 5.6 0 2.2-1.7 3.4-3.4 3.4-1 0-1.7-.5-2.6-.5s-1.6.5-2.6.5C7.7 20 6 18.8 6 16.6 6 14 8.7 11 12 11z" />
          <ellipse cx="5" cy="10.5" rx="2" ry="2.5" transform="rotate(-20 5 10.5)" />
          <ellipse cx="9" cy="6.2" rx="2.1" ry="2.7" transform="rotate(-8 9 6.2)" />
          <ellipse cx="15" cy="6.2" rx="2.1" ry="2.7" transform="rotate(8 15 6.2)" />
          <ellipse cx="19" cy="10.5" rx="2" ry="2.5" transform="rotate(20 19 10.5)" />
        </>
      );
    case "card":
      return (
        <>
          <rect x="5" y="2.5" width="14" height="19" rx="2.2" />
          <path
            d="M12 6.5c1.9 2 4.2 3.4 4.2 5.6a2.3 2.3 0 0 1-3.6 1.9l.6 2.5h-2.4l.6-2.5a2.3 2.3 0 0 1-3.6-1.9c0-2.2 2.3-3.6 4.2-5.6z"
            fill="#fff"
          />
        </>
      );
    case "mic":
      return (
        <>
          <rect x="8.5" y="2" width="7" height="11.5" rx="3.5" />
          <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 17v3.5M8.5 21h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9 6h6M9 8.8h6" stroke="#fff" strokeWidth="1" />
        </>
      );
    case "dice":
      return (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
          {[
            [8, 8],
            [16, 8],
            [12, 12],
            [8, 16],
            [16, 16],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#fff" />
          ))}
        </>
      );
  }
}

/** 押されたスタンプ（親の大きさいっぱいに描く） */
export function StampMark({ kind, className = "" }: { kind: StampKind; className?: string }) {
  if (kind === "logo") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={IMG.mark} alt={`${STAMP_LABEL.logo}スタンプ`} className={`object-contain ${className}`} />;
  }
  return (
    <svg viewBox="0 0 32 32" className={`text-rose-600 ${className}`} role="img" aria-label={`${STAMP_LABEL[kind]}スタンプ`}>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="12.2" fill="none" stroke="currentColor" strokeWidth=".7" strokeDasharray="1.4 1.2" />
      <g transform="translate(4.6 4.6) scale(.95)" fill="currentColor">
        <Icon kind={kind} />
      </g>
    </svg>
  );
}
