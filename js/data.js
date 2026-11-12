'use strict';
/* 샘플 정제 데이터 — 실제 파보센스 데이터가 아니다. 관리자 > 데이터 게시에서 CSV를 올리면 교체된다. */

const BASE_DATE_DEFAULT = '2026-11-01';
const PASS_CORDY = 2.0; // 예시 기준치 (코디세핀 mg/g) — 회사 기준이 정해지면 교체

// CSV 업로드는 여기 있는 지역 코드만 받는다 — 지역을 늘리면 여기에 먼저 추가
const REGIONS = [
  { id: 'GB', ko: '경북', en: 'Gyeongbuk', ar: 'كيونغبوك' },
  { id: 'CB', ko: '충북', en: 'Chungbuk', ar: 'تشونغبوك' },
  { id: 'JB', ko: '전북', en: 'Jeonbuk', ar: 'جونبوك' },
  { id: 'GW', ko: '강원', en: 'Gangwon', ar: 'غانغوون' },
  { id: 'GN', ko: '경남', en: 'Gyeongnam', ar: 'كيونغنام' },
  { id: 'JN', ko: '전남', en: 'Jeonnam', ar: 'جونّام' },
];

const FARMS = Array.from({ length: 12 }, (_, i) => ({
  id: 'F' + String(i + 1).padStart(2, '0'),
  region: REGIONS[i % 6].id,
  supplier: 'S-' + 'ABCDEFGH'[i % 8],
}));

// groups = 처음 게시할 때 볼 수 있는 고객 그룹 (관리자 화면에서 바꾼다)
const DATASETS = [
  { id: 'trend', groups: ['gov', 'biz', 'farm'] },
  { id: 'region', groups: ['gov'] },
  { id: 'pass', groups: ['gov', 'biz'] },
  { id: 'supplier', groups: ['biz'] },
  { id: 'variance', groups: ['biz', 'farm'] },
  { id: 'myfarm', groups: ['farm'] },
  { id: 'batches', groups: ['gov', 'biz', 'farm'] },
];

// 고정 시드 난수로 2025-11 ~ 2026-10 배치 결과를 만든다 (새로고침해도 같은 값)
const SAMPLE = (() => {
  let a = 20261101;
  const rnd = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const bias = { GB: .35, CB: .1, JB: .2, GW: -.15, GN: 0, JN: -.3 };
  const noise = [.25, .5, .35, .6, .3, .45, .7, .28];
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const ym = new Date(Date.UTC(2025, 10 + m, 1)).toISOString().slice(0, 7);
    const n = 22 + m * 2 + Math.floor(rnd() * 10);
    for (let i = 0; i < n; i++) {
      const f = FARMS[Math.floor(rnd() * FARMS.length)];
      const sd = noise['ABCDEFGH'.indexOf(f.supplier.slice(2))];
      rows.push({
        date: `${ym}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
        region: f.region, supplier: f.supplier, farm: f.id,
        batch: `B${ym.slice(2, 4)}${ym.slice(5)}-${String(i + 1).padStart(3, '0')}`,
        cordycepin: +Math.max(.6, 2.15 + bias[f.region] + m * .025 + gauss() * sd).toFixed(2),
        adenosine: +Math.max(.2, .82 + bias[f.region] * .3 + gauss() * sd * .3).toFixed(2),
      });
    }
  }
  return rows;
})();
