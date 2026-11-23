import "server-only";
import { randomInt } from "node:crypto";
import type { Rng } from "@/lib/games";

/** 暗号学的に安全な乱数（0以上1未満）。スロット・宝くじ・なでなでの抽選に使う */
export const secureRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;
