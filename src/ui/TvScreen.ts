import Phaser from "phaser";

// Прямоугольник экрана телевизора в чилл-зоне (мировые px фона).
const SCREEN = { x: 1063, y: 80, w: 122, h: 58 };
const TEX_KEY = "tvGameMini";

// Мини-версия игры на экране TV — как мини-слайд у проектора. Каждый кадр
// копирует canvas запущенной игры на текстуру экрана. Кнопка в углу (и сам
// экран) разворачивают игру на весь экран.
export class TvScreen {
  private image: Phaser.GameObjects.Image;
  private btnBg: Phaser.GameObjects.Rectangle;
  private btnIcon: Phaser.GameObjects.Graphics;
  private tex: Phaser.Textures.CanvasTexture;
  private surface: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private source: HTMLCanvasElement | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onExpand: () => void,
  ) {
    this.surface = document.createElement("canvas");
    this.surface.width = SCREEN.w;
    this.surface.height = SCREEN.h;
    this.sctx = this.surface.getContext("2d")!;
    this.tex = this.scene.textures.addCanvas(TEX_KEY, this.surface)!;

    this.image = scene.add
      .image(SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.h / 2, TEX_KEY)
      .setDepth(SCREEN.y)
      .setInteractive({ useHandCursor: true });
    this.image.on("pointerdown", () => this.onExpand());

    [this.btnBg, this.btnIcon] = this.buildButton();
    this.setVisible(false);
  }

  show(source: HTMLCanvasElement): void {
    this.source = source;
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
    this.source = null;
  }

  // Перерисовка текстуры из canvas игры (вписываем с сохранением пропорций).
  update(): void {
    if (!this.source || !this.image.visible) return;
    const ctx = this.sctx;
    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    const s = this.source;
    if (s.width > 0 && s.height > 0) {
      const fit = Math.min(SCREEN.w / s.width, SCREEN.h / s.height);
      const dw = s.width * fit;
      const dh = s.height * fit;
      ctx.drawImage(s, (SCREEN.w - dw) / 2, (SCREEN.h - dh) / 2, dw, dh);
    }
    this.tex.refresh();
  }

  private setVisible(v: boolean): void {
    this.image.setVisible(v);
    this.btnBg.setVisible(v);
    this.btnIcon.setVisible(v);
  }

  // Кнопка «развернуть» в углу экрана: иконка-уголки.
  private buildButton(): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Graphics] {
    const size = 16;
    const bx = SCREEN.x + SCREEN.w - size / 2 - 3;
    const by = SCREEN.y + size / 2 + 3;

    const bg = this.scene.add
      .rectangle(bx, by, size, size, 0x11141a, 0.7)
      .setStrokeStyle(1, 0x7ac07a)
      .setDepth(SCREEN.y + 1)
      .setInteractive({ useHandCursor: true });
    bg.on("pointerdown", () => this.onExpand());

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
