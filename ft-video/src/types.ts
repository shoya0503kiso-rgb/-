export type Player = {
  /** 表示名 */
  name: string;
  /** 肩書き・キャッチコピー（任意） */
  title?: string;
  /** 席番号（任意） */
  seat?: number;
  /** 持ち点 */
  chips: number;
  /** assets/videos/ 内のファイル名 */
  video: string;
  /** assets/images/ 内のファイル名（省略すると本人動画の1コマを自動で使う） */
  image?: string;
  /** この人だけ動画の秒数を変えたいとき（任意） */
  videoSeconds?: number;
  /** この人だけ動画の拡大率を変えたいとき（任意。settings.videoZoom を上書き） */
  videoZoom?: number;
  /** 拡大したとき、横のどこを中心に見せるか 0（左端）〜100（右端）。既定 50 */
  videoFocusX?: number;
};

export type Transition = "flash" | "glitch" | "both" | "auto";

export type Settings = {
  /** 本人動画を流す秒数（既定 5） */
  videoSeconds?: number;
  /** assets/ からのBGMパス。null / 未指定なら無音 */
  bgm?: string | null;
  /** BGM音量 0〜1 */
  bgmVolume?: number;
  /** 本人動画が流れている間のBGM音量（動画の声を聞かせたいとき下げる） */
  bgmVolumeDuringVideo?: number;
  /** 本人動画の音量 0〜1（0で消音） */
  videoVolume?: number;
  /** 本人動画の拡大率。1 = 全体が収まる大きさ。横長の動画を縦型で大きく見せたいときに上げる */
  videoZoom?: number;
  /** 動画→キャラ画像の切り替え演出。auto = フラッシュとグリッチを交互（チップリーダーは両方） */
  transition?: Transition;
};

export type Tournament = {
  store: string;
  title: string;
  subtitle?: string;
  date: string;
};

export type FTData = {
  tournament: Tournament;
  settings?: Settings;
  players: Player[];
};
