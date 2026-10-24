import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";

/**
 * 横方向にズレる帯＋色ズレのグリッチ。intensity 0 なら素通し。
 * 中身を複数回描くので、重い動画ではなく画像側に使う。
 */
export const GlitchSlices: React.FC<{ intensity: number; children: React.ReactNode; slices?: number }> = ({
  intensity,
  children,
  slices = 9,
}) => {
  const frame = useCurrentFrame();
  if (intensity <= 0.01) return <AbsoluteFill>{children}</AbsoluteFill>;
  const cuts = new Array(slices - 1)
    .fill(0)
    .map((_, i) => random(`cut-${frame}-${i}`) * 100)
    .sort((a, b) => a - b);
  const bounds = [0, ...cuts, 100];
  return (
    <AbsoluteFill>
      {/* 色ズレ（シアン/マゼンタ） */}
      <AbsoluteFill
        style={{ transform: `translateX(${-24 * intensity}px)`, opacity: 0.55 * intensity, filter: "sepia(1) hue-rotate(150deg) saturate(6)", mixBlendMode: "screen" }}
      >
        {children}
      </AbsoluteFill>
      {bounds.slice(0, -1).map((top, i) => {
        const bottom = 100 - bounds[i + 1];
        const offset = (random(`off-${frame}-${i}`) * 2 - 1) * 120 * intensity * (random(`on-${frame}-${i}`) > 0.4 ? 1 : 0.1);
        return (
          <AbsoluteFill key={i} style={{ clipPath: `inset(${top}% 0 ${bottom}% 0)`, transform: `translateX(${offset}px)` }}>
            {children}
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill
        style={{ transform: `translateX(${20 * intensity}px)`, opacity: 0.45 * intensity, filter: "sepia(1) hue-rotate(-50deg) saturate(6)", mixBlendMode: "screen" }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 上に重ねるノイズ帯・走査線（動画の上でも軽く使える） */
export const GlitchOverlay: React.FC<{ intensity: number }> = ({ intensity }) => {
  const frame = useCurrentFrame();
  if (intensity <= 0.01) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, transparent 2px, transparent 5px)",
          opacity: intensity,
        }}
      />
      {new Array(6).fill(0).map((_, i) => {
        if (random(`bar-on-${frame}-${i}`) > 0.6 * intensity + 0.2) return null;
        const top = random(`bar-t-${frame}-${i}`) * 100;
        const h = 1 + random(`bar-h-${frame}-${i}`) * 7;
        const colors = ["rgba(0,255,255,0.5)", "rgba(255,0,200,0.5)", "rgba(255,230,150,0.6)", "rgba(255,255,255,0.7)"];
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${random(`bar-l-${frame}-${i}`) * 40}%`,
              width: `${30 + random(`bar-w-${frame}-${i}`) * 70}%`,
              top: `${top}%`,
              height: `${h}%`,
              background: colors[i % colors.length],
              mixBlendMode: "screen",
              opacity: intensity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
