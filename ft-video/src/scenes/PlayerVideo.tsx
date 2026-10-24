import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { layoutOf, shake } from "../components/effects";
import { GlitchOverlay } from "../components/Glitch";
import { GoldText } from "../components/GoldText";
import { FONT_EN, FONT_NUM, GOLD, GOLD_GRADIENT_H } from "../theme";
import type { PlayerSlot } from "../timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 本人動画パート。最後の数フレームで切り替え演出の「溜め」を入れる */
export const PlayerVideo: React.FC<{ slot: PlayerSlot; total: number; volume: number }> = ({ slot, total, volume }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const { u } = layoutOf(width, height);
  const src = staticFile(`videos/${slot.player.video}`);

  const end = durationInFrames;
  const glitchy = slot.transition !== "flash";
  const glitch = glitchy ? interpolate(frame, [end - 10, end], [0, 1], clamp) : 0;
  const punch = interpolate(frame, [end - 8, end], [1, 1.12], clamp);
  const bright = slot.transition !== "glitch" ? interpolate(frame, [end - 6, end], [1, 2.2], clamp) : 1;
  const sh = glitchy ? shake(frame, end - 10, 10, 30 * u * glitch + 1, `vid-${slot.order}`) : { x: 0, y: 0 };
  const hue = glitchy && glitch > 0 ? (frame % 2 ? 40 : -40) * glitch : 0;
  const fadeIn = interpolate(frame, [0, 6], [0, 1], clamp);

  const label = slot.isLeader ? "CHIP LEADER" : `PLAYER ${slot.order + 1} / ${total}`;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeIn }}>
      <AbsoluteFill
        style={{
          transform: `translate(${sh.x}px, ${sh.y}px) scale(${punch})`,
          filter: `brightness(${bright}) hue-rotate(${hue}deg) saturate(${1 + glitch})`,
        }}
      >
        {/* ぼかした同じ映像を背景に敷き、縦横どちらの素材でも余白が出ないようにする */}
        <AbsoluteFill style={{ filter: "blur(40px) brightness(0.45)", transform: "scale(1.2)" }}>
          <OffthreadVideo src={src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
        <AbsoluteFill>
          <OffthreadVideo src={src} volume={volume} muted={volume <= 0} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* 上下の黒グラデと金ライン */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 18%, transparent 80%, rgba(0,0,0,0.8) 100%)" }} />
      <div style={{ position: "absolute", left: 60 * u, right: 60 * u, top: 70 * u, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <GoldText size={44 * u} font={FONT_EN} letterSpacing={4 * u}>
          FINAL TABLE
        </GoldText>
        {slot.player.seat != null ? (
          <div style={{ fontFamily: FONT_NUM, fontSize: 44 * u, color: "#fff", letterSpacing: 4 * u, border: `${3 * u}px solid ${GOLD}`, padding: `${4 * u}px ${18 * u}px` }}>
            SEAT {slot.player.seat}
          </div>
        ) : null}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 90 * u, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * u }}>
        <div style={{ width: 500 * u, height: 3 * u, background: GOLD_GRADIENT_H }} />
        <div style={{ fontFamily: FONT_EN, fontSize: 40 * u, color: GOLD, letterSpacing: 8 * u }}>{label}</div>
      </div>

      <GlitchOverlay intensity={glitch} />
    </AbsoluteFill>
  );
};
