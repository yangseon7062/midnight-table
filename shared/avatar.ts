import type { AvatarLook } from './platform';

/** 아바타 커스터마이징 옵션. 클라이언트(그리기/편집)와 서버(검증)가 함께 쓴다. */
export const SKIN_TONES = ['#f6d7bd', '#eec39a', '#d9a47a', '#b97c55', '#8d5a3b'];
export const HAIR_STYLES = ['단정한 숏컷', '긴 생머리', '단발', '곱슬머리', '포니테일', '올백', '중절모', '베레모'];
export const HAIR_COLORS = ['#1d1a1f', '#4a3226', '#8a5a36', '#c9a36a', '#b8b8c4', '#7a2f2f', '#2e3f66'];
export const OUTFITS = ['트렌치코트', '정장', '드레스', '니트 조끼', '가운', '하이넥'];
export const OUTFIT_COLORS = ['#7b5b3c', '#2b2d3a', '#6d2330', '#355244', '#4b3f6b', '#b59a64', '#8f8f96', '#2f5c73'];
export const ACCESSORIES = ['없음', '안경', '외알 안경', '목도리', '리본', '콧수염'];

export const LOOK_LIMITS: Record<keyof AvatarLook, number> = {
  skin: SKIN_TONES.length,
  hair: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  outfit: OUTFITS.length,
  outfitColor: OUTFIT_COLORS.length,
  accessory: ACCESSORIES.length,
};

export function sanitizeLook(input: unknown): AvatarLook {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = {} as AvatarLook;
  for (const key of Object.keys(LOOK_LIMITS) as (keyof AvatarLook)[]) {
    const n = Number(src[key]);
    out[key] = Number.isInteger(n) && n >= 0 && n < LOOK_LIMITS[key] ? n : 0;
  }
  return out;
}

export function randomLook(): AvatarLook {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    skin: r(SKIN_TONES.length),
    hair: r(HAIR_STYLES.length),
    hairColor: r(HAIR_COLORS.length),
    outfit: r(OUTFITS.length),
    outfitColor: r(OUTFIT_COLORS.length),
    accessory: r(ACCESSORIES.length),
  };
}
