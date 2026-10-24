import React, { useMemo } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import "./fonts";
import { Ending } from "./scenes/Ending";
import { LeaderIntro } from "./scenes/LeaderIntro";
import { Opening } from "./scenes/Opening";
import { PlayerReveal } from "./scenes/PlayerReveal";
import { PlayerVideo } from "./scenes/PlayerVideo";
import { buildTimeline, byChipsDesc } from "./timeline";
import type { FTData } from "./types";

export const FinalTable: React.FC<FTData> = (data) => {
  const { fps } = useVideoConfig();
  const timeline = useMemo(() => buildTimeline(data, fps), [data, fps]);
  const ranking = useMemo(() => [...data.players].sort(byChipsDesc), [data.players]);
  const s = data.settings ?? {};
  const bgmVolume = s.bgmVolume ?? 0.6;
  const duck = s.bgmVolumeDuringVideo ?? bgmVolume;
  const videoVolume = s.videoVolume ?? 1;

  // 本人動画の間だけBGMを下げる（前後10フレームでなめらかに）
  const bgmVolumeAt = (f: number) => {
    let v = bgmVolume;
    for (const slot of timeline.slots) {
      const a = slot.video.from;
      const b = a + slot.video.duration;
      if (f >= a - 10 && f <= b + 10) {
        const k = interpolate(f, [a - 10, a, b, b + 10], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        v = Math.min(v, bgmVolume + (duck - bgmVolume) * k);
      }
    }
    const fadeOut = interpolate(f, [timeline.total - 45, timeline.total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return v * fadeOut;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence from={timeline.opening.from} durationInFrames={timeline.opening.duration} name="オープニング">
        <Opening tournament={data.tournament} playerCount={data.players.length} />
      </Sequence>

      {timeline.slots.map((slot) => (
        <React.Fragment key={slot.order}>
          {slot.intro ? (
            <Sequence from={slot.intro.from} durationInFrames={slot.intro.duration} name={`入場演出 ${slot.player.name}`}>
              <LeaderIntro slot={slot} />
            </Sequence>
          ) : null}
          <Sequence from={slot.video.from} durationInFrames={slot.video.duration} name={`動画 ${slot.player.name}`}>
            <PlayerVideo player={slot.player} transition={slot.videoTransition} label={data.tournament.title} volume={videoVolume} />
          </Sequence>
          <Sequence from={slot.reveal.from} durationInFrames={slot.reveal.duration} name={`紹介 ${slot.player.name}`}>
            <PlayerReveal slot={slot} />
          </Sequence>
        </React.Fragment>
      ))}

      <Sequence from={timeline.ending.from} durationInFrames={timeline.ending.duration} name="エンディング">
        <Ending ranking={ranking} tournament={data.tournament} />
      </Sequence>

      {s.bgm ? <Audio src={staticFile(s.bgm)} loop volume={bgmVolumeAt} /> : null}
    </AbsoluteFill>
  );
};
