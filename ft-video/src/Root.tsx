import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import data from "../players.json";
import { FinalTable } from "./FinalTable";
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
  </>
);
