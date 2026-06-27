import Phaser from "phaser";

export type SpriteKey =
  | "dev"
  | "dev-fe"
  | "analyst"
  | "owner"
  | "lead"
  | "qa"
  | "designer";

// Ключ спрайта -> имя файла в public/assets/characters.
export const SPRITE_FILES: Record<SpriteKey, string> = {
  dev: "characters/dev.png",
  "dev-fe": "characters/dev-fe.png",
  analyst: "characters/analyst.png",
  owner: "characters/product-owner.png",
  lead: "characters/lead.png",
  qa: "characters/qa.png",
  designer: "characters/desinger.png",
};

export const ALL_SPRITES = Object.keys(SPRITE_FILES) as SpriteKey[];

// Картинки уже с прозрачным фоном. Кэшируем их, чтобы портреты в DOM-канвасах
// (Dialogue, CharacterSelect) могли рисоваться без доступа к сцене.
const images = new Map<SpriteKey, HTMLImageElement>();

export function registerSpriteImages(scene: Phaser.Scene): void {
  for (const key of ALL_SPRITES) {
    images.set(key, scene.textures.get(key).getSourceImage() as HTMLImageElement);
  }
}

export const getSpriteImage = (k: SpriteKey) => images.get(k)!;

// Масштаб спрайта, чтобы его высота на экране равнялась targetH пикселям.
export function spriteScale(scene: Phaser.Scene, sprite: SpriteKey, targetH: number): number {
  return targetH / scene.textures.get(sprite).getSourceImage().height;
}

// Рисует картинку по центру квадрата size x size с сохранением пропорций.
export function drawContain(ctx: CanvasRenderingContext2D, src: HTMLImageElement, size: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  const scale = Math.min(size / src.width, size / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
}

// Пикселизация: рисуем src уменьшенным до lowW×lowH и растягиваем обратно
// до outW×outH без сглаживания. Возвращает готовый canvas.
export function pixelate(
  src: CanvasImageSource,
  outW: number,
  outH: number,
  lowW: number,
  lowH: number,
): HTMLCanvasElement {
  const small = document.createElement("canvas");
  small.width = lowW;
  small.height = lowH;
  small.getContext("2d")!.drawImage(src, 0, 0, lowW, lowH);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, lowW, lowH, 0, 0, outW, outH);
  return out;
}
