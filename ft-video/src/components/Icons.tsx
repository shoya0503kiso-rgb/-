import React from "react";

/** カジノチップ */
export const ChipIcon: React.FC<{ size: number; color?: string; style?: React.CSSProperties }> = ({ size, color = "#B3121B", style }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
    <circle cx="50" cy="50" r="48" fill={color} stroke="#F7D98A" strokeWidth="3" />
    {new Array(8).fill(0).map((_, i) => (
      <rect key={i} x="44" y="2" width="12" height="18" fill="#FFF6D5" transform={`rotate(${i * 45} 50 50)`} />
    ))}
    <circle cx="50" cy="50" r="30" fill="none" stroke="#F7D98A" strokeWidth="3" strokeDasharray="6 4" />
    <circle cx="50" cy="50" r="22" fill={color} />
    <text x="50" y="58" textAnchor="middle" fontSize="22" fontWeight="900" fill="#F7D98A" fontFamily="Oswald, sans-serif">
      9H
    </text>
  </svg>
);

/** 王冠 */
export const Crown: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 100 75" style={style}>
    <defs>
      <linearGradient id="crownGold" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#FFF6D5" />
        <stop offset="45%" stopColor="#E9C46A" />
        <stop offset="55%" stopColor="#8A5A12" />
        <stop offset="100%" stopColor="#F3D27E" />
      </linearGradient>
    </defs>
    <path d="M6 22 L28 44 L50 8 L72 44 L94 22 L86 64 L14 64 Z" fill="url(#crownGold)" stroke="#5a3a08" strokeWidth="2" />
    <rect x="14" y="62" width="72" height="10" rx="2" fill="url(#crownGold)" stroke="#5a3a08" strokeWidth="2" />
    <circle cx="6" cy="22" r="5" fill="#FFF1BF" />
    <circle cx="50" cy="8" r="6" fill="#FFF1BF" />
    <circle cx="94" cy="22" r="5" fill="#FFF1BF" />
    <circle cx="50" cy="44" r="6" fill="#C1121F" stroke="#FFF1BF" strokeWidth="1.5" />
  </svg>
);
