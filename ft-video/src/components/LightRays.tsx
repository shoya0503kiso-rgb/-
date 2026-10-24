import React from "react";
import { useCurrentFrame } from "remotion";

/** 背後で回転する放射状の光 */
export const LightRays: React.FC<{
  size: number;
  opacity?: number;
  speed?: number;
  rays?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ size, opacity = 1, speed = 0.4, rays = 18, color = "rgba(255,214,120,0.35)", style }) => {
  const frame = useCurrentFrame();
  const step = 360 / rays;
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        left: "50%",
        top: "50%",
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: "50%",
        opacity,
        background: `repeating-conic-gradient(from ${frame * speed}deg, ${color} 0deg ${step * 0.35}deg, transparent ${step * 0.35}deg ${step}deg)`,
        WebkitMaskImage: "radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 35%, transparent 70%)",
        maskImage: "radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 35%, transparent 70%)",
        ...style,
      }}
    />
  );
};
