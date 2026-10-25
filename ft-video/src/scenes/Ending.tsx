import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { layoutOf } from "../components/effects";
import { GoldText } from "../components/GoldText";
import { Flash } from "../components/Flash";
import { Crown } from "../components/Icons";
import { FONT_EN, FONT_JP, FONT_NUM, formatChips, GOLD, GOLD_GRADIENT, GOLD_GRADIENT_H } from "../theme";
import { imageOf } from "../timeline";
import type { Player, Tournament } from "../types";
import { fitSize } from "./PlayerReveal";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** エンディング：持ち点ランキング（縦型は1列、横型は2列） */
export const Ending: React.FC<{ ranking: Player[]; tournament: Tournament }> = ({ ranking, tournament }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const { u, vertical } = layoutOf(width, height);

  const cols = vertical || ranking.length <= 5 ? 1 : 2;
  const perCol = Math.ceil(ranking.length / cols);
  const headerH = (vertical ? 330 : 228) * u;
  const footerH = (vertical ? 200 : 160) * u;
  const sidePad = (vertical ? 50 : 90) * u;
  const colGap = 50 * u;
  const colW = (width - sidePad * 2 - colGap * (cols - 1)) / cols;
  const rowGap = 12 * u;
  const rowH = Math.min(190 * u, (height - headerH - footerH - rowGap * (perCol - 1)) / Math.max(perCol, 1));
  const max = Math.max(...ranking.map((p) => p.chips), 1);

  const titleIn = spring({ frame, fps, config: { damping: 14 } });
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], clamp);
  const footerIn = interpolate(frame, [70, 90], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <Background intensity={0.8} particles={40} />
      <Flash at={0} after={10} peak={0.6} />

      <div style={{ position: "absolute", top: (vertical ? 80 : 26) * u, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 * u, transform: `scale(${0.6 + 0.4 * titleIn})`, opacity: titleIn }}>
        <GoldText size={(vertical ? 110 : 100) * u} font={FONT_EN} letterSpacing={8 * u} shine={interpolate(frame, [10, 50], [-20, 130], clamp)}>
          FINAL TABLE
        </GoldText>
        <div style={{ fontFamily: FONT_EN, fontSize: 44 * u, color: "#fff", letterSpacing: 14 * u }}>CHIP COUNTS</div>
        <div style={{ width: 600 * u, height: 3 * u, background: GOLD_GRADIENT_H, marginTop: 8 * u }} />
      </div>

      {ranking.map((p, i) => {
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        // 下位から順に飛び込み、最後に1位
        const delay = 14 + (ranking.length - 1 - i) * 5 + (i === 0 ? 8 : 0);
        const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 150 } });
        const bar = interpolate(frame, [delay + 6, delay + 30], [0, p.chips / max], { ...clamp, easing: Easing.out(Easing.cubic) });
        const leader = i === 0;
        const left = sidePad + col * (colW + colGap);
        const top = headerH + row * (rowH + rowGap);
        const thumb = rowH - 16 * u;
        const rankSize = Math.min(rowH * 0.55, 90 * u);
        const nameMax = colW - thumb - rankSize * 1.5 - 360 * u;

        return (
          <div
            key={`${p.name}-${i}`}
            style={{
              position: "absolute",
              left,
              top,
              width: colW,
              height: rowH,
              transform: `translateX(${(1 - s) * width}px)`,
              opacity: interpolate(s, [0, 0.3], [0, 1], clamp),
              display: "flex",
              alignItems: "center",
              gap: 20 * u,
              padding: `0 ${24 * u}px 0 ${12 * u}px`,
              boxSizing: "border-box",
              background: leader
                ? "linear-gradient(90deg, rgba(233,196,106,0.35), rgba(120,80,20,0.25) 60%, rgba(0,0,0,0.5))"
                : "linear-gradient(90deg, rgba(255,255,255,0.08), rgba(0,0,0,0.5))",
              border: `${(leader ? 4 : 2) * u}px solid ${leader ? GOLD : "rgba(233,196,106,0.35)"}`,
              boxShadow: leader ? `0 0 ${40 * u * (0.7 + 0.3 * Math.sin(frame / 6))}px rgba(233,196,106,0.7)` : "none",
            }}
          >
            {/* 持ち点バー */}
            <div style={{ position: "absolute", left: 0, bottom: 0, height: 5 * u, width: `${bar * 100}%`, background: GOLD_GRADIENT_H, opacity: 0.9 }} />
            <div style={{ width: rankSize * 1.2, textAlign: "center", flexShrink: 0 }}>
              {leader ? (
                <Crown size={rankSize * 1.1} />
              ) : (
                <span style={{ fontFamily: FONT_NUM, fontSize: rankSize, color: i < 3 ? GOLD : "#fff" }}>{i + 1}</span>
              )}
            </div>
            <div style={{ width: thumb, height: thumb, flexShrink: 0, padding: 3 * u, background: GOLD_GRADIENT, boxSizing: "border-box" }}>
              <Img src={staticFile(imageOf(p))} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${p.image ? 50 : (p.videoFocusX ?? 50)}% top`, display: "block" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 * u }}>
              {p.title && rowH > 120 * u ? (
                <div style={{ fontFamily: FONT_JP, fontSize: 26 * u, color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
              ) : null}
              <div style={{ fontFamily: FONT_JP, fontSize: fitSize(p.name, Math.min(rowH * 0.36, 62 * u), nameMax), color: "#fff", whiteSpace: "nowrap" }}>{p.name}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {leader ? (
                <GoldText size={Math.min(rowH * 0.42, 76 * u)} font={FONT_NUM} glow={0.9}>
                  {formatChips(p.chips)}
                </GoldText>
              ) : (
                <span style={{ fontFamily: FONT_NUM, fontSize: Math.min(rowH * 0.38, 66 * u), color: "#fff" }}>{formatChips(p.chips)}</span>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ position: "absolute", bottom: (vertical ? 60 : 30) * u, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 * u, opacity: footerIn }}>
        <GoldText size={(vertical ? 64 : 52) * u} font={FONT_EN} letterSpacing={10 * u}>
          GOOD LUCK!
        </GoldText>
        <div style={{ fontFamily: FONT_JP, fontSize: 34 * u, color: "#fff", letterSpacing: 4 * u }}>
          {tournament.store}　{tournament.date}
        </div>
      </div>
    </AbsoluteFill>
  );
};
