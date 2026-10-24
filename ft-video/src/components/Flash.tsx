import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

/** at フレームで最大になる白（少し金がかった）フラッシュ */
export const Flash: React.FC<{ at: number; before?: number; after?: number; peak?: number; color?: string }> = ({
  at,
  before = 4,
  after = 12,
  peak = 1,
  color = "#FFF8E6",
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [at - before, at, at + after], [0, peak, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: color, opacity, pointerEvents: "none" }} />;
};
