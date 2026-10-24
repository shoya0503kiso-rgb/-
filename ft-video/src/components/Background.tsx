import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { Suit, SUITS } from "./Suit";

/** 黒×金の背景：中央の金のにじみ＋漂うトランプのスート＋舞い上がる金粉 */
export const Background: React.FC<{ intensity?: number; particles?: number }> = ({ intensity = 1, particles = 70 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const s = Math.min(width, height) / 1080;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, rgba(120,84,20,${0.45 * intensity}) 0%, rgba(40,26,6,${0.5 * intensity}) 35%, #000 75%)`,
        }}
      />
      {/* 斜めの細いライン（高級感の地紋） */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(233,196,106,0.05) 0px, rgba(233,196,106,0.05) 2px, transparent 2px, transparent 28px)",
          backgroundPosition: `${frame * 0.6}px 0px`,
        }}
      />
      {/* 漂うスート */}
      {new Array(10).fill(0).map((_, i) => {
        const x = random(`suit-x-${i}`) * width;
        const speed = 0.3 + random(`suit-sp-${i}`) * 0.6;
        const size = (80 + random(`suit-s-${i}`) * 160) * s;
        const y = height + size - ((random(`suit-y-${i}`) * (height + size * 2) + frame * speed * s * 2) % (height + size * 2));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              opacity: 0.06 * intensity,
              transform: `rotate(${(random(`suit-r-${i}`) - 0.5) * 60 + frame * 0.2 * (i % 2 ? 1 : -1)}deg)`,
            }}
          >
            <Suit kind={SUITS[i % 4]} size={size} color="#E9C46A" />
          </div>
        );
      })}
      {/* 金粉 */}
      {new Array(particles).fill(0).map((_, i) => {
        const size = (2 + random(`p-s-${i}`) * 6) * s;
        const speed = (0.6 + random(`p-sp-${i}`) * 2.2) * s;
        const x = random(`p-x-${i}`) * width + Math.sin(frame / 25 + i) * 20 * s;
        const y = height - ((random(`p-y-${i}`) * height + frame * speed) % height);
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(frame / (8 + (i % 7)) + i));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: "#FFE7A3",
              opacity: twinkle * 0.8 * intensity,
              boxShadow: `0 0 ${size * 3}px ${size}px rgba(233,196,106,0.6)`,
            }}
          />
        );
      })}
      {/* 周辺減光 */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.85) 100%)" }} />
    </AbsoluteFill>
  );
};
