import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { layoutOf, shake } from "../components/effects";
import { Flash } from "../components/Flash";
import { GlitchOverlay } from "../components/Glitch";
import { GoldText } from "../components/GoldText";
import { FONT_EN, GOLD, GOLD_GRADIENT_H } from "../theme";
import type { Player, Transition } from "../types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * 本人動画パート。最後の数フレームで切り替え演出の「溜め」を入れる。
 * 持ち点・席番号・紹介順に左右される表示は入れない（持ち点が決まる前に作り置きできるように）
 */
export const PlayerVideo: React.FC<{
  player: Player;
  transition: Exclude<Transition, "auto">;
  label: string;
  volume: number;
}> = ({ player, transition, label, volume }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const { u } = layoutOf(width, height);
  const src = staticFile(`videos/${player.video}`);

  const end = durationInFrames;
  const glitchy = transition !== "flash";
  const glitch = glitchy ? interpolate(frame, [end - 10, end], [0, 1], clamp) : 0;
  const punch = interpolate(frame, [end - 8, end], [1, 1.12], clamp);
  const bright = transition !== "glitch" ? interpolate(frame, [end - 6, end], [1, 2.2], clamp) : 1;
  const sh = glitchy ? shake(frame, end - 10, 10, 30 * u * glitch + 1, `vid-${player.name}`) : { x: 0, y: 0 };
  const hue = glitchy && glitch > 0 ? (frame % 2 ? 40 : -40) * glitch : 0;
  const fadeIn = interpolate(frame, [0, 6], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{
          opacity: fadeIn,
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
      <div style={{ position: "absolute", left: 0, right: 0, top: 70 * u, display: "flex", justifyContent: "center" }}>
        <GoldText size={48 * u} font={FONT_EN} letterSpacing={8 * u}>
          FINAL TABLE
        </GoldText>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 90 * u, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * u }}>
        <div style={{ width: 500 * u, height: 3 * u, background: GOLD_GRADIENT_H }} />
        <div style={{ fontFamily: FONT_EN, fontSize: 40 * u, color: GOLD, letterSpacing: 8 * u }}>{label}</div>
      </div>

      <GlitchOverlay intensity={glitch} />
      <Flash at={0} after={6} peak={0.35} color="#F7D98A" />
    </AbsoluteFill>
  );
};
