import React, { useMemo } from "react";
import { AbsoluteFill, CalculateMetadataFunction } from "remotion";
import "./fonts";
import { Ending } from "./scenes/Ending";
import { LeaderIntro } from "./scenes/LeaderIntro";
import { Opening } from "./scenes/Opening";
import { PlayerReveal } from "./scenes/PlayerReveal";
import { PlayerVideo } from "./scenes/PlayerVideo";
import { buildTimeline, byChipsDesc, FPS } from "./timeline";
import type { FTData } from "./types";

/**
 * 動画を1パートずつ書き出すための入れ物（scripts/render-fast.mjs 用）。
 * 本人動画パートは持ち点に関係なく作れるので、先に作ってキャッシュしておける。
 */
export type SegmentProps = {
  part: "opening" | "video" | "leaderIntro" | "reveal" | "ending";
  orientation: "vertical" | "horizontal";
  data: FTData;
  /** video / leaderIntro / reveal のときの対象プレイヤー名 */
  playerName?: string;
};

const findSlot = (props: SegmentProps) => {
  const slot = buildTimeline(props.data, FPS).slots.find((s) => s.player.name === props.playerName);
  if (!slot) throw new Error(`プレイヤーが見つかりません: ${props.playerName}`);
  return slot;
};

export const calculateSegmentMetadata: CalculateMetadataFunction<SegmentProps> = ({ props }) => {
  const [width, height] = props.orientation === "horizontal" ? [1920, 1080] : [1080, 1920];
  const t = buildTimeline(props.data, FPS);
  const span =
    props.part === "opening"
      ? t.opening
      : props.part === "ending"
        ? t.ending
        : props.part === "video"
          ? findSlot(props).video
          : props.part === "reveal"
            ? findSlot(props).reveal
            : findSlot(props).intro!;
  return { width, height, durationInFrames: span.duration };
};

export const Segment: React.FC<SegmentProps> = (props) => {
  const { part, data } = props;
  const ranking = useMemo(() => [...data.players].sort(byChipsDesc), [data.players]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {part === "opening" ? <Opening tournament={data.tournament} playerCount={data.players.length} /> : null}
      {part === "ending" ? <Ending ranking={ranking} tournament={data.tournament} /> : null}
      {part === "video" ? (
        <PlayerVideo
          player={findSlot(props).player}
          transition={findSlot(props).videoTransition}
          label={data.tournament.title}
          volume={data.settings?.videoVolume ?? 1}
        />
      ) : null}
      {part === "leaderIntro" ? <LeaderIntro slot={findSlot(props)} /> : null}
      {part === "reveal" ? <PlayerReveal slot={findSlot(props)} /> : null}
    </AbsoluteFill>
  );
};
