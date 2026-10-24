import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { layoutOf, shake } from "../components/effects";
import { Flash } from "../components/Flash";
import { GlitchOverlay, GlitchSlices } from "../components/Glitch";
import { GoldText } from "../components/GoldText";
import { ChipIcon, Crown } from "../components/Icons";
import { LightRays } from "../components/LightRays";
import { FONT_EN, FONT_JP, FONT_NUM, formatChips, GOLD, GOLD_GRADIENT, GOLD_GRADIENT_H } from "../theme";
import type { PlayerSlot } from "../timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 名前の長さから、はみ出さないフォントサイズを概算 */
export const fitSize = (text: string, base: number, maxWidth: number) => {
  const est = [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.72), 0);
  return Math.min(base, maxWidth / Math.max(est, 1));
};

export const PlayerReveal: React.FC<{ slot: PlayerSlot }> = ({ slot }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const { u, vertical } = layoutOf(width, height);
  const { player, isLeader } = slot;

  // --- キャラ画像のズームイン ---
  const zoom = spring({ frame, fps, config: { damping: 14, stiffness: 160, mass: 0.8 } });
  const IMPACT = 8;
  const imgScale = interpolate(zoom, [0, 1], [2.6, 1]) * interpolate(frame, [IMPACT, 200], [1, 1.06], clamp);
  const sh = shake(frame, IMPACT, isLeader ? 24 : 16, (isLeader ? 34 : 20) * u, `rev-${slot.order}`);
  const glitch = slot.transition === "flash" ? 0 : interpolate(frame, [0, 14], [1, 0], clamp);
  const flare = interpolate(frame, [IMPACT + 2, IMPACT + 26], [-60, 160], clamp);
  const glowPulse = 0.6 + 0.4 * Math.sin(frame / 6);

  // --- テキストのスライドイン ---
  const slide = (start: number, from: number) => {
    const s = spring({ frame: frame - start, fps, config: { damping: 15, stiffness: 140 } });
    return { opacity: interpolate(s, [0, 0.3], [0, 1], clamp), transform: `translateX(${(1 - s) * from}px)` };
  };
  const T_TITLE = isLeader ? 26 : 16;
  const T_NAME = T_TITLE + 6;
  const T_CHIPS = T_NAME + 8;
  const COUNT_START = T_CHIPS + 4;
  const COUNT_LEN = isLeader ? 70 : 45;
  const progress = interpolate(frame, [COUNT_START, COUNT_START + COUNT_LEN], [0, 1], {
    ...clamp,
    easing: isLeader ? Easing.out(Easing.exp) : Easing.out(Easing.cubic),
  });
  const COUNT_END = COUNT_START + COUNT_LEN;
  const donePop = frame >= COUNT_END ? 1 + 0.18 * (1 - spring({ frame: frame - COUNT_END, fps, config: { damping: 8, stiffness: 200 } })) : 1;
  const chipsGlow = frame >= COUNT_END ? 0.9 : 0.4;

  // --- レイアウト ---
  const frameW = vertical ? 800 * u : 600 * u;
  const frameH = frameW * (4 / 3);
  const frameLeft = vertical ? (width - frameW) / 2 : 220 * u;
  const frameTop = vertical ? 210 * u : (height - frameH) / 2 + (isLeader ? 40 * u : 0);
  const crownSize = (vertical ? 220 : 150) * u;
  const textBox: React.CSSProperties = vertical
    ? { left: 70 * u, right: 70 * u, top: frameTop + frameH + 60 * u, alignItems: "center" }
    : { left: frameLeft + frameW + 120 * u, right: 100 * u, top: 0, bottom: 0, justifyContent: "center", alignItems: "flex-start" };
  const textMaxW = vertical ? width - 140 * u : width - (frameLeft + frameW + 220 * u);
  const nameSize = fitSize(player.name, (isLeader ? 150 : 130) * u, textMaxW);

  const centerX = frameLeft + frameW / 2;
  const centerY = frameTop + frameH / 2;

  return (
    <AbsoluteFill>
      <Background intensity={isLeader ? 1.3 : 1} />

      {/* 背後の光 */}
      <div style={{ position: "absolute", left: centerX, top: centerY, width: 0, height: 0 }}>
        <LightRays size={Math.max(width, height) * 1.5} opacity={interpolate(frame, [IMPACT - 2, IMPACT + 6], [0, isLeader ? 1 : 0.8], clamp)} speed={isLeader ? 0.9 : 0.4} />
        {isLeader ? (
          <LightRays size={Math.max(width, height) * 1.2} opacity={0.5} speed={-0.6} rays={10} color="rgba(255,255,255,0.25)" />
        ) : null}
      </div>

      {/* チップリーダー：衝撃波リング */}
      {isLeader
        ? [0, 6, 12].map((d) => {
            const t = interpolate(frame, [IMPACT + d, IMPACT + d + 24], [0, 1], clamp);
            if (t <= 0 || t >= 1) return null;
            const r = t * Math.max(width, height) * 0.9;
            return (
              <div
                key={d}
                style={{
                  position: "absolute",
                  left: centerX - r,
                  top: centerY - r,
                  width: r * 2,
                  height: r * 2,
                  borderRadius: "50%",
                  border: `${(1 - t) * 18 * u}px solid rgba(255,225,150,${1 - t})`,
                  boxShadow: `0 0 ${40 * u}px rgba(233,196,106,${1 - t})`,
                }}
              />
            );
          })
        : null}

      {/* キャラ画像 */}
      <div
        style={{
          position: "absolute",
          left: frameLeft,
          top: frameTop,
          width: frameW,
          height: frameH,
          transform: `translate(${sh.x}px, ${sh.y}px) scale(${imgScale})`,
          opacity: interpolate(frame, [0, 4], [0, 1], clamp),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -10 * u,
            background: GOLD_GRADIENT,
            boxShadow: `0 0 ${(isLeader ? 90 : 60) * u * glowPulse}px rgba(233,196,106,${isLeader ? 0.9 : 0.6})`,
          }}
        />
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: "#111" }}>
          <GlitchSlices intensity={glitch}>
            <Img src={staticFile(`images/${player.image}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
          </GlitchSlices>
          {/* 光が走る */}
          <AbsoluteFill
            style={{
              background: `linear-gradient(115deg, transparent ${flare - 15}%, rgba(255,255,255,0.75) ${flare}%, transparent ${flare + 15}%)`,
              mixBlendMode: "overlay",
            }}
          />
          <AbsoluteFill style={{ background: "linear-gradient(180deg, transparent 65%, rgba(0,0,0,0.55) 100%)" }} />
          <GlitchOverlay intensity={glitch} />
        </div>
        {isLeader ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: -crownSize * 0.68,
              transform: `translateX(-50%) translateY(${interpolate(spring({ frame: frame - 18, fps, config: { damping: 10 } }), [0, 1], [-300 * u, 0])}px) rotate(${Math.sin(frame / 10) * 3}deg)`,
              filter: `drop-shadow(0 0 ${30 * u}px rgba(255,220,130,0.9))`,
            }}
          >
            <Crown size={crownSize} />
          </div>
        ) : null}
      </div>

      {/* チップリーダー：チップが弾け飛ぶ */}
      {isLeader
        ? new Array(18).fill(0).map((_, i) => {
            const t = frame - IMPACT;
            if (t < 0 || t > 60) return null;
            const ang = random(`ca-${i}`) * Math.PI * 2;
            const v = (18 + random(`cv-${i}`) * 26) * u;
            const x = centerX + Math.cos(ang) * v * t;
            const y = centerY + Math.sin(ang) * v * t + 0.9 * u * t * t;
            return (
              <div key={i} style={{ position: "absolute", left: x, top: y, transform: `rotate(${t * 15 + i * 40}deg) scaleX(${Math.cos(t / 3 + i)})`, opacity: interpolate(t, [40, 60], [1, 0], clamp) }}>
                <ChipIcon size={(60 + random(`cs-${i}`) * 40) * u} color={i % 3 === 0 ? "#111" : i % 3 === 1 ? "#B3121B" : "#0B4F2E"} />
              </div>
            );
          })
        : null}

      {/* 名前・持ち点 */}
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", gap: 14 * u, ...textBox }}>
        {isLeader ? (
          <div style={{ ...slide(T_TITLE - 6, -600 * u) }}>
            <div style={{ background: GOLD_GRADIENT, padding: `${6 * u}px ${30 * u}px`, fontFamily: FONT_EN, fontSize: 50 * u, color: "#1a1004", letterSpacing: 8 * u, boxShadow: `0 0 ${30 * u}px rgba(233,196,106,0.8)` }}>
              ★ CHIP LEADER ★
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 20 * u, ...slide(T_TITLE, -600 * u) }}>
          {player.seat != null ? (
            <div style={{ fontFamily: FONT_NUM, fontSize: 40 * u, color: "#000", background: GOLD, padding: `${2 * u}px ${16 * u}px`, letterSpacing: 2 * u }}>SEAT {player.seat}</div>
          ) : null}
          {player.title ? <div style={{ fontFamily: FONT_JP, fontSize: 44 * u, color: "#fff", textShadow: `0 0 ${12 * u}px rgba(0,0,0,0.9)` }}>{player.title}</div> : null}
        </div>
        <div style={{ ...slide(T_NAME, 700 * u) }}>
          <GoldText size={nameSize} font={FONT_JP} shine={interpolate(frame, [T_NAME + 10, T_NAME + 40], [-20, 130], clamp)}>
            {player.name}
          </GoldText>
        </div>
        <div style={{ width: (vertical ? 760 : 700) * u, height: 4 * u, background: GOLD_GRADIENT_H, ...slide(T_NAME + 2, -800 * u) }} />
        <div style={{ display: "flex", alignItems: "center", gap: 22 * u, ...slide(T_CHIPS, -600 * u) }}>
          <ChipIcon size={96 * u} style={{ transform: `rotate(${progress * 720}deg)` }} />
          <div style={{ transform: `scale(${donePop})`, transformOrigin: vertical ? "center" : "left center" }}>
            <GoldText size={(isLeader ? 150 : 130) * u} font={FONT_NUM} glow={chipsGlow} letterSpacing={3 * u}>
              {formatChips(player.chips * progress)}
            </GoldText>
          </div>
          <div style={{ fontFamily: FONT_EN, fontSize: 36 * u, color: GOLD, alignSelf: "flex-end", marginBottom: 22 * u }}>CHIPS</div>
        </div>
      </div>

      <Flash at={COUNT_END} before={1} after={10} peak={isLeader ? 0.6 : 0.25} />
    </AbsoluteFill>
  );
};
