'use strict';

// 初期設定。data/settings.json がないときにこの内容で作成する。
const HANDS = [
  { id: 'fullhouse', name: 'フルハウス', short: 'フルハウス' },
  { id: 'quads', name: 'フォーカード', short: 'フォーカード' },
  { id: 'straightflush', name: 'ストレートフラッシュ', short: 'ストフラ' },
  { id: 'royal', name: 'ロイヤルフラッシュ', short: 'ロイヤル' },
];

function defaultSettings() {
  return {
    adminPassword: '9high',
    // 対象ゲーム: 'both' | 'tournament' | 'cash'
    targetGame: 'both',
    // ハズレのうちガセリーチにする割合(%)
    fakeReachRate: 30,
    spins: { fullhouse: 1, quads: 2, straightflush: 3, royal: 5 },
    // ロイヤルフラッシュの1回目を確定させる絵柄ID
    royalFirstSymbolId: 'jackpot',
    // tier: 演出の格(0=ハズレ, 1=小, 2=中, 3=大, 4=大当たり)
    symbols: [
      { id: 'miss', emoji: '💀', prize: 'ハズレ', rate: 45, tier: 0 },
      { id: 'drink', emoji: '🍺', prize: 'ソフトドリンク1杯', rate: 25, tier: 1 },
      { id: 'point', emoji: '⭐', prize: 'ポイント', rate: 15, tier: 2 },
      { id: 'stack', emoji: '🪙', prize: '次回スタック +5000', rate: 10, tier: 3 },
      { id: 'jackpot', emoji: '7️⃣', prize: '大当たり(次回エントリー無料)', rate: 5, tier: 4 },
    ],
  };
}

module.exports = { HANDS, defaultSettings };
