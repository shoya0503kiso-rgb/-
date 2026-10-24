import type { FTData, Player, Transition } from "./types";

export const FPS = 30;

// 各パートの長さ（フレーム数, 30fps）
export const OPENING_FRAMES = 150; // 5秒
export const REVEAL_FRAMES = 120; // 4秒
export const LEADER_INTRO_FRAMES = 105; // 3.5秒
export const LEADER_REVEAL_FRAMES = 165; // 5.5秒
export const ENDING_FRAMES = 240; // 8秒

export type Span = { from: number; duration: number };

export type PlayerSlot = {
  player: Player;
  /** 紹介順（0始まり） */
  order: number;
  /** 持ち点順位（1 = チップリーダー） */
  rank: number;
  isLeader: boolean;
  intro?: Span;
  video: Span;
  reveal: Span;
  /** 画像側の切り替え演出（チップリーダーは auto だと both） */
  transition: Exclude<Transition, "auto">;
  /** 動画側の切り替え演出。持ち点に左右されないので動画パートを作り置きできる */
  videoTransition: Exclude<Transition, "auto">;
};

export type Timeline = {
  opening: Span;
  slots: PlayerSlot[];
  ending: Span;
  total: number;
};

/** 持ち点の多い順（同点は席番号順） */
export const byChipsDesc = (a: Player, b: Player) => b.chips - a.chips || (a.seat ?? 99) - (b.seat ?? 99);

/** 名前から決まるフラッシュ/グリッチ（持ち点や紹介順に左右されない） */
export const autoTransitionOf = (name: string): "flash" | "glitch" =>
  [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0 ? "flash" : "glitch";

/** 画像ファイル名。省略時は check.mjs が本人動画から切り出す画像 */
export const imageOf = (p: Player) => (p.image ? `images/${p.image}` : `images/_auto/${p.video.replace(/\.[^.]+$/, "")}.jpg`);

export const buildTimeline = (data: FTData, fps = FPS): Timeline => {
  const settings = data.settings ?? {};
  const ranking = [...data.players].sort(byChipsDesc);
  // 紹介は持ち点の少ない順。最後がチップリーダー
  const order = [...ranking].reverse();

  let cursor = 0;
  const opening = { from: cursor, duration: OPENING_FRAMES };
  cursor += OPENING_FRAMES;

  const slots: PlayerSlot[] = order.map((player, i) => {
    const isLeader = i === order.length - 1;
    const videoFrames = Math.max(1, Math.round((player.videoSeconds ?? settings.videoSeconds ?? 5) * fps));
    let intro: Span | undefined;
    if (isLeader) {
      intro = { from: cursor, duration: LEADER_INTRO_FRAMES };
      cursor += LEADER_INTRO_FRAMES;
    }
    const video = { from: cursor, duration: videoFrames };
    cursor += videoFrames;
    const revealFrames = isLeader ? LEADER_REVEAL_FRAMES : REVEAL_FRAMES;
    const reveal = { from: cursor, duration: revealFrames };
    cursor += revealFrames;

    const t = settings.transition ?? "auto";
    const videoTransition = t === "auto" ? autoTransitionOf(player.name) : t;
    const transition = t === "auto" && isLeader ? "both" : videoTransition;

    return { player, order: i, rank: ranking.indexOf(player) + 1, isLeader, intro, video, reveal, transition, videoTransition };
  });

  const ending = { from: cursor, duration: ENDING_FRAMES };
  cursor += ENDING_FRAMES;

  return { opening, slots, ending, total: cursor };
};
