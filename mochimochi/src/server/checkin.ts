import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { distanceMeters } from "@/lib/geo";
import { businessDate } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";
import { applyPointDay, changePoints } from "./points";
import { getRankTiers, getSettings, rankFor } from "./settings";

/** その営業日のチェックインコード（日替わり。qrSalt を変えると即座に変わる） */
export function checkinCode(date: string, salt: string) {
  const secret = process.env.SESSION_SECRET ?? "";
  const mac = createHmac("sha256", secret).update(`checkin:${salt}:${date}`).digest("base64url");
  return mac.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
}

function sameCode(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** QR に入れる URL。LINE（LIFF）を設定したら LINE アプリ内で開く URL にする */
export function checkinUrl(code: string) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (liffId) return `https://liff.line.me/${liffId}/checkin?c=${code}`;
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/checkin?c=${code}`;
}

export async function todayCheckin(now = new Date()) {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  const code = checkinCode(date, s.qrSalt);
  return { date, code, url: checkinUrl(code) };
}

export interface CheckinResult {
  points: number;
  stampCount: number;
  stampsPerCard: number;
  cardCompleted: boolean;
  cardBonus: number;
  visitCount: number;
  rankName: string;
  rankUp: boolean;
}

export async function checkIn(
  memberId: string,
  code: string,
  geo: { lat: number; lng: number } | null,
  now = new Date(),
): Promise<CheckinResult> {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  if (!code || !sameCode(code, checkinCode(date, s.qrSalt))) {
    throw new UserError("このQRコードは使えません。お店のタブレットに表示されている今日のQRを読み取ってください");
  }
  if (s.geoEnabled && s.geoLat != null && s.geoLng != null) {
    if (!geo) throw new UserError("位置情報をオンにしてから、もう一度読み取ってください");
    if (distanceMeters(geo.lat, geo.lng, s.geoLat, s.geoLng) > s.geoRadiusM) {
      throw new UserError("お店の近くでチェックインしてください");
    }
  }
  const pointDay = await prisma.pointDay.findUnique({ where: { date } });
  const points = applyPointDay(s.checkinPoints, pointDay, "checkin");
  const tiers = await getRankTiers();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.visit.create({ data: { memberId, businessDate: date, points } });
      const before = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
      const perCard = Math.max(1, s.stampsPerCard);
      const stamped = before.stampCount + 1;
      const cardCompleted = stamped >= perCard;
      const m = await tx.member.update({
        where: { id: memberId },
        data: {
          visitCount: { increment: 1 },
          stampCount: cardCompleted ? 0 : stamped,
          completedCards: cardCompleted ? { increment: 1 } : undefined,
          lastVisitDate: date,
        },
      });
      await changePoints(tx, { memberId, amount: points, kind: "checkin", businessDate: date });
      const cardBonus = cardCompleted ? s.stampCardBonus : 0;
      await changePoints(tx, { memberId, amount: cardBonus, kind: "stamp_card", note: `${m.completedCards}枚目`, businessDate: date });
      const prevRank = rankFor(before.visitCount, tiers).current.name;
      const rank = rankFor(m.visitCount, tiers).current.name;
      return {
        points,
        stampCount: cardCompleted ? perCard : stamped,
        stampsPerCard: perCard,
        cardCompleted,
        cardBonus,
        visitCount: m.visitCount,
        rankName: rank,
        rankUp: rank !== prevRank,
      };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new UserError("今日はもうチェックイン済みです。また明日！");
    }
    throw e;
  }
}
