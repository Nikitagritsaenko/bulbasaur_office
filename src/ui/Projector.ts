import Phaser from "phaser";
import type { Character } from "../data/characters";
import { pixelate } from "../entities/sprites";
import { SAMPLE_SLIDES, slidePaths } from "./slides";

// Прямоугольник экрана проектора в переговорке (мировые px фона).
const SCREEN = { x: 166, y: 431, w: 170, h: 82 };
const TEX_KEY = "projectorSlide";
const BLOCK = 5; // размер «пикселя» слайда на экране, мировых px

export class Projector {
  private image: Phaser.GameObjects.Image;
  private btnBg: Phaser.GameObjects.Rectangle;
  private btnIcon: Phaser.GameObjects.Graphics;
  private loadToken = 0; // отсекает результаты устаревших загрузок при быстрой смене слайдов

  private slides: string[] = [];
  private index = 0;

  constructor(
    private scene: Phaser.Scene,
    private onFullscreen: (slides: string[], index: number) => void,
  ) {
    this.image = scene.add
      .image(SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.h / 2, "__DEFAULT")
      .setDepth(SCREEN.y);
    [this.btnBg, this.btnIcon] = this.buildButton();
    this.setVisible(false);
  }

  show(npc: Character): void {
    this.slides = slidePaths(npc);
    this.index = 0;
    this.load();
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }

  // Синхронизация со страницей, выбранной в полноэкранном просмотре.
  setIndex(index: number): void {
    if (index === this.index || index < 0 || index >= this.slides.length) return;
    this.index = index;
    this.load();
  }

  private setVisible(v: boolean): void {
    this.image.setVisible(v);
    this.btnBg.setVisible(v);
    this.btnIcon.setVisible(v);
  }

  private load(): void {
    const token = ++this.loadToken;
    const img = new Image();
    img.onload = () => {
      if (token === this.loadToken) this.draw(img);
    };
    img.onerror = () => {
      if (token === this.loadToken) this.fallback();
    };
    img.src = this.slides[this.index];
  }

  private fallback(): void {
    if (this.slides === SAMPLE_SLIDES) return;
    this.slides = SAMPLE_SLIDES;
    this.index = 0;
    this.load();
  }

  // Вписываем слайд в экран и пикселизуем (уменьшаем и растягиваем без сглаживания).
  private draw(img: HTMLImageElement): void {
    const { naturalWidth: w, naturalHeight: h } = img;
    const fit = Math.min(SCREEN.w / w, SCREEN.h / h);
    const outW = Math.max(1, Math.round(w * fit));
    const outH = Math.max(1, Math.round(h * fit));
    const lowW = Math.max(1, Math.round(outW / BLOCK));
    const lowH = Math.max(1, Math.round(outH / BLOCK));

    if (this.scene.textures.exists(TEX_KEY)) this.scene.textures.remove(TEX_KEY);
    this.scene.textures.addCanvas(TEX_KEY, pixelate(img, outW, outH, lowW, lowH));
    this.image.setTexture(TEX_KEY);
  }

  // Кнопка «во весь экран» в углу экрана: иконка-уголки.
  private buildButton(): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Graphics] {
    const size = 18;
    const bx = SCREEN.x + SCREEN.w - size / 2 - 4;
    const by = SCREEN.y + size / 2 + 4;

    const bg = this.scene.add
      .rectangle(bx, by, size, size, 0x11141a, 0.7)
      .setStrokeStyle(1, 0x7ac07a)
      .setDepth(SCREEN.y + 1)
      .setInteractive({ useHandCursor: true });
    bg.on("pointerdown", () => this.onFullscreen(this.slides, this.index));

    const a = size / 2 - 3;
    const icon = this.scene.add.graphics({ x: bx, y: by }).setDepth(SCREEN.y + 2);
    icon.lineStyle(1.5, 0x7ac07a, 1);
    icon.beginPath();
    icon.moveTo(-a + 3, -a); icon.lineTo(-a, -a); icon.lineTo(-a, -a + 3);
    icon.moveTo(a - 3, -a); icon.lineTo(a, -a); icon.lineTo(a, -a + 3);
    icon.moveTo(-a + 3, a); icon.lineTo(-a, a); icon.lineTo(-a, a - 3);
    icon.moveTo(a - 3, a); icon.lineTo(a, a); icon.lineTo(a, a - 3);
    icon.strokePath();

    return [bg, icon];
  }
}
