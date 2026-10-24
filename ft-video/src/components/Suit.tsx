import React from "react";

export type SuitKind = "spade" | "heart" | "diamond" | "club";
export const SUITS: SuitKind[] = ["spade", "heart", "diamond", "club"];

const PATHS: Record<SuitKind, string> = {
  heart: "M50 90 C20 65 4 48 4 30 C4 15 15 5 28 5 C38 5 46 11 50 20 C54 11 62 5 72 5 C85 5 96 15 96 30 C96 48 80 65 50 90 Z",
  diamond: "M50 2 L88 50 L50 98 L12 50 Z",
  spade:
    "M50 4 C80 30 96 46 96 62 C96 76 86 84 74 84 C65 84 58 80 54 74 C55 84 60 92 68 96 L32 96 C40 92 45 84 46 74 C42 80 35 84 26 84 C14 84 4 76 4 62 C4 46 20 30 50 4 Z",
  club:
    "M50 4 C63 4 72 14 72 26 C72 32 70 37 66 41 C70 40 73 39 76 39 C88 39 97 48 97 60 C97 72 88 81 76 81 C67 81 60 77 55 70 C56 82 61 90 68 96 L32 96 C39 90 44 82 45 70 C40 77 33 81 24 81 C12 81 3 72 3 60 C3 48 12 39 24 39 C27 39 30 40 34 41 C30 37 28 32 28 26 C28 14 37 4 50 4 Z",
};

export const Suit: React.FC<{ kind: SuitKind; size: number; color: string; style?: React.CSSProperties }> = ({
  kind,
  size,
  color,
  style,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
    <path d={PATHS[kind]} fill={color} />
  </svg>
);
