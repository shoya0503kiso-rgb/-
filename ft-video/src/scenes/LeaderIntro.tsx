import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { layoutOf, shake } from "../components/effects";
import { Flash } from "../components/Flash";
import { GoldText } from "../components/GoldText";
import { FONT_EN, FONT_JP, FONT_NUM, GOLD } from "../theme";
import { imageOf, type PlayerSlot } from "../timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 格闘技の入場風：スポットライト → 煽り文句 → 「CHIP LEADER」ドーン → シルエット */
export const LeaderIntro: React.FC<{ slot: PlayerSlot }> = ({ slot }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const { u, vertical } = layoutOf(width, height);

  const SLAM = 52;
  const slam = spring({ frame: frame - SLAM, fps, config: { damping: 11, stiffness: 220 } });
  const sh = shake(frame, SLAM, 22, 40 * u, "leader-intro");
  const lineA = interpolate(frame, [4, 16, SLAM - 6, SLAM], [0, 1, 1, 0], clamp);
  const lineB = interpolate(frame, [22, 32, SLAM - 4, SLAM], [0, 1, 1, 0], clamp);
  const spread = interpolate(frame, [0, durationInFrames], [0, 1]);
  const silhouette = interpolate(frame, [SLAM + 10, SLAM + 26], [0, 1], clamp);
  const outro = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], clamp);

  const spot = (side: 1 | -1) => {
    const angle = side * (25 - 35 * Math.sin(frame / 14 + (side > 0 ? 0 : 1.5)));
    return (
      <div
        style={{
          position: "absolute",
          left: side > 0 ? width * 0.15 : width * 0.85,
          top: -height * 0.05,
          width: 0,
          height: 0,
          transform: `rotate(${angle}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -width * 0.35,
            width: width * 0.7,
            height: height * 1.4,
            background: "linear-gradient(180deg, rgba(255,236,180,0.55) 0%, rgba(255,214,120,0.15) 60%, transparent 100%)",
            clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
            filter: `blur(${12 * u}px)`,
            mixBlendMode: "screen",
          }}
        />
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity: outro }}>
      {/* 煙 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at ${30 + spread * 20}% 80%, rgba(90,70,40,0.5) 0%, transparent 45%), radial-gradient(ellipse at ${80 - spread * 25}% 70%, rgba(70,55,30,0.45) 0%, transparent 40%)`,
        }}
      />
      {spot(1)}
      {spot(-1)}

      {/* 暗がりにうっすら見える本人（まだはっきりは見せない） */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: vertical ? "flex-end" : "center", opacity: silhouette }}>
        <Img
          src={staticFile(imageOf(slot.player))}
          style={{
            height: (vertical ? 1250 : 900) * u,
            filter: `grayscale(1) brightness(0.35) contrast(1.3) blur(${4 * u}px) sepia(0.6)`,
            transform: `scale(${1 + spread * 0.08})`,
            WebkitMaskImage: "radial-gradient(ellipse at 50% 45%, #000 30%, transparent 70%)",
            maskImage: "radial-gradient(ellipse at 50% 45%, #000 30%, transparent 70%)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <div style={{ position: "absolute", top: height * 0.38, fontFamily: FONT_EN, fontSize: 54 * u, color: "#fff", letterSpacing: 14 * u, opacity: lineA, textShadow: `0 0 ${20 * u}px ${GOLD}` }}>
          LADIES AND GENTLEMEN
        </div>
        <div style={{ position: "absolute", top: height * 0.47, fontFamily: FONT_JP, fontSize: 66 * u, color: GOLD, letterSpacing: 6 * u, opacity: lineB }}>
          最後に登場するのは…
        </div>

        {frame >= SLAM ? (
          <div
            style={{
              position: "absolute",
              top: vertical ? height * 0.2 : height * 0.12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transform: `scale(${interpolate(slam, [0, 1], [3.2, 1])})`,
              opacity: interpolate(slam, [0, 0.2], [0, 1], clamp),
            }}
          >
            <GoldText size={(vertical ? 118 : 170) * u} font={FONT_EN} letterSpacing={6 * u} shine={interpolate(frame, [SLAM + 8, SLAM + 34], [-20, 130], clamp)} glow={1}>
              CHIP LEADER
            </GoldText>
            <div style={{ fontFamily: FONT_JP, fontSize: 60 * u, color: "#fff", letterSpacing: 20 * u, marginTop: 10 * u, textShadow: `0 0 ${20 * u}px #000` }}>チップリーダー</div>
            {slot.player.seat != null ? (
              <div
                style={{
                  marginTop: 30 * u,
                  fontFamily: FONT_NUM,
                  fontSize: 56 * u,
                  color: "#000",
                  background: GOLD,
                  padding: `${4 * u}px ${30 * u}px`,
                  letterSpacing: 6 * u,
                  opacity: interpolate(frame, [SLAM + 16, SLAM + 24], [0, 1], clamp),
                  transform: `translateY(${interpolate(frame, [SLAM + 16, SLAM + 24], [30 * u, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px)`,
                }}
              >
                SEAT {slot.player.seat}
              </div>
            ) : null}
          </div>
        ) : null}
      </AbsoluteFill>

      <Flash at={SLAM} before={1} after={16} />
      <Flash at={0} after={6} peak={0.35} color="#F7D98A" />
    </AbsoluteFill>
  );
};
