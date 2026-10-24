import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import data from "../players.json";
import { FinalTable } from "./FinalTable";
import { calculateSegmentMetadata, Segment, type SegmentProps } from "./Segment";
import { buildTimeline, FPS } from "./timeline";
import type { FTData } from "./types";

const calculateMetadata: CalculateMetadataFunction<FTData> = ({ props }) => ({
  durationInFrames: buildTimeline(props, FPS).total,
});

// players.json を書き換えると、プレビューも書き出しも自動で変わる
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="FT-Vertical"
      component={FinalTable}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={buildTimeline(data as FTData, FPS).total}
      defaultProps={data as FTData}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="FT-Horizontal"
      component={FinalTable}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={buildTimeline(data as FTData, FPS).total}
      defaultProps={data as FTData}
      calculateMetadata={calculateMetadata}
    />
    {/* 1パートずつ書き出す用（npm run fast） */}
    <Composition
      id="Segment"
      component={Segment}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ part: "opening", orientation: "vertical", data: data as FTData } satisfies SegmentProps}
      calculateMetadata={calculateSegmentMetadata}
    />
  </>
);
