import { random } from "remotion";

/** start フレームから duration かけて減衰する揺れ */
export const shake = (frame: number, start: number, duration: number, amplitude: number, seed = "s") => {
  const t = frame - start;
  if (t < 0 || t > duration) return { x: 0, y: 0 };
  const decay = 1 - t / duration;
  return {
    x: (random(`${seed}-x-${frame}`) * 2 - 1) * amplitude * decay * decay,
    y: (random(`${seed}-y-${frame}`) * 2 - 1) * amplitude * decay * decay,
  };
};

/** 動画サイズに合わせた倍率（1080基準）と縦型かどうか */
export const layoutOf = (width: number, height: number) => ({
  u: Math.min(width, height) / 1080,
  vertical: height >= width,
});
