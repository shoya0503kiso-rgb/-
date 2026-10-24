import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { layoutOf, shake } from "../components/effects";
import { Flash } from "../components/Flash";
import { GoldText } from "../components/GoldText";
import { LightRays } from "../components/LightRays";
import { Suit, SUITS } from "../components/Suit";
import { FONT_EN, FONT_JP, FONT_NUM, GOLD, GOLD_GRADIENT_H } from "../theme";
import type { Tournament } from "../types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Opening: React.FC<{ tournament: Tournament; playerCount: number }> = ({ tournament, playerCount }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const { u, vertical } = layoutOf(width, height);

  const HIT = 30; // FINAL と TABLE がぶつかるフレーム
  const finalX = interpolate(frame, [12, HIT], [-width, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
  const tableX = interpolate(frame, [12, HIT], [width, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
  const hitPop = spring({ frame: frame - HIT, fps, config: { damping: 9, stiffness: 180 } });
  const titleScale = frame < HIT ? 1 : 1.25 - 0.25 * hitPop;
  const sh = shake(frame, HIT, 18, 28 * u, "op");
  const shine = interpolate(frame, [45, 80], [-20, 120], clamp);

  const storeIn = interpolate(frame, [0, 15], [0, 1], clamp);
  const lineW = interpolate(frame, [HIT + 4, HIT + 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const info = (start: number) => ({
    opacity: interpolate(frame, [start, start + 12], [0, 1], clamp),
    transform: `translateY(${interpolate(frame, [start, start + 12], [30 * u, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px)`,
  });
  const outro = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 1.15], clamp);
  const titleSize = (vertical ? 210 : 230) * u;

  return (
    <AbsoluteFill>
      <Background intensity={interpolate(frame, [0, 20], [0.3, 1], clamp)} />
      <AbsoluteFill style={{ opacity: interpolate(frame, [HIT, HIT + 10], [0, 1], clamp) }}>
        <LightRays size={Math.max(width, height) * 1.6} opacity={0.7} speed={0.3} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `translate(${sh.x}px, ${sh.y}px) scale(${outro})`,
          gap: 26 * u,
        }}
      >
        <div style={{ opacity: storeIn, fontFamily: FONT_JP, color: "#fff", fontSize: 64 * u, letterSpacing: 8 * u, textShadow: `0 0 ${20 * u}px rgba(233,196,106,0.8)` }}>
          {tournament.store}
          <span style={{ fontFamily: FONT_EN, color: GOLD, fontSize: 40 * u, marginLeft: 20 * u, letterSpacing: 6 * u }}>PRESENTS</span>
        </div>

        <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center", gap: vertical ? 0 : 40 * u, transform: `scale(${titleScale})` }}>
          <div style={{ transform: `translateX(${finalX}px)` }}>
            <GoldText size={titleSize} font={FONT_EN} shine={shine} letterSpacing={10 * u}>
              FINAL
            </GoldText>
          </div>
          <div style={{ transform: `translateX(${tableX}px)` }}>
            <GoldText size={titleSize} font={FONT_EN} shine={shine - 15} letterSpacing={10 * u}>
              TABLE
            </GoldText>
          </div>
        </div>

        <div style={{ width: 800 * u * lineW, height: 4 * u, background: GOLD_GRADIENT_H, boxShadow: `0 0 ${20 * u}px ${GOLD}` }} />

        <div style={{ ...info(HIT + 14), fontFamily: FONT_EN, color: "#fff", fontSize: 64 * u, letterSpacing: 6 * u, textAlign: "center" }}>
          {tournament.title}
        </div>
        {tournament.subtitle ? (
          <div style={{ ...info(HIT + 20), fontFamily: FONT_JP, color: GOLD, fontSize: 52 * u, letterSpacing: 4 * u, textAlign: "center" }}>
            {tournament.subtitle}
          </div>
        ) : null}
        <div style={{ ...info(HIT + 26), fontFamily: FONT_NUM, color: "#fff", fontSize: 58 * u, letterSpacing: 10 * u }}>{tournament.date}</div>

        <div style={{ ...info(HIT + 40), display: "flex", alignItems: "center", gap: 22 * u, marginTop: 30 * u }}>
          {SUITS.slice(0, 2).map((s) => (
            <Suit key={s} kind={s} size={44 * u} color={s === "heart" ? "#C1121F" : GOLD} />
          ))}
          <GoldText size={70 * u} font={FONT_NUM} letterSpacing={6 * u}>
            {playerCount} PLAYERS
          </GoldText>
          {SUITS.slice(2).map((s) => (
            <Suit key={s} kind={s} size={44 * u} color={s === "diamond" ? "#C1121F" : GOLD} />
          ))}
        </div>
      </AbsoluteFill>

      <Flash at={HIT} before={2} after={14} />
    </AbsoluteFill>
  );
};
