import React from "react";
import { GOLD_GRADIENT } from "../theme";

type Props = {
  children: React.ReactNode;
  size: number;
  font: string;
  /** 光が走る位置 0〜100（範囲外なら光なし） */
  shine?: number;
  letterSpacing?: number;
  glow?: number;
  style?: React.CSSProperties;
};

/** 金属調の金文字。shine で光の帯を走らせる */
export const GoldText: React.FC<Props> = ({ children, size, font, shine = -100, letterSpacing = 0, glow = 0.6, style }) => {
  const shineLayer = `linear-gradient(105deg, transparent ${shine - 8}%, rgba(255,255,255,0.95) ${shine}%, transparent ${shine + 8}%)`;
  return (
    <span
      style={{
        fontFamily: font,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing,
        backgroundImage: `${shineLayer}, ${GOLD_GRADIENT}`,
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.02}px rgba(0,0,0,0.9)) drop-shadow(0 0 ${size * 0.25}px rgba(233,196,106,${glow}))`,
        whiteSpace: "nowrap",
        display: "inline-block",
        ...style,
      }}
    >
      {children}
    </span>
  );
};
