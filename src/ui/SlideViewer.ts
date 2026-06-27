import { pixelate } from "../entities/sprites";
import { SAMPLE_SLIDES } from "./slides";
import type { KeyConsumer } from "./KeyboardRouter";

const PIXEL_SIZE = 450; // длинная сторона уменьшенной копии в пиксельном режиме

export class SlideViewer implements KeyConsumer {
  isOpen = false;

  private root = document.getElementById("slides")!;
  private img = document.getElementById("slidesImg") as HTMLImageElement;
  private canvas = document.getElementById("slidesCanvas") as HTMLCanvasElement;
  private counter = document.getElementById("slidesCount")!;
  private prevBtn = document.getElementById("slidesPrev") as HTMLButtonElement;
  private nextBtn = document.getElementById("slidesNext") as HTMLButtonElement;

  private slides: string[] = [];
  private index = 0;

  constructor(private onClose: (index: number) => void) {
    document.getElementById("slidesClose")!.onclick = () => this.close();
    this.prevBtn.onclick = () => this.go(-1);
    this.nextBtn.onclick = () => this.go(1);
    document.getElementById("slidesFull")!.onclick = () => this.root.classList.toggle("maximized");
    document.getElementById("slidesPixel")!.onclick = () => this.togglePixel();
    this.img.onerror = () => this.fallbackToSample();
    this.img.onload = () => {
      if (this.root.classList.contains("pixel")) this.drawPixel();
    };
  }

  // Разворачивает слайды на весь экран. Канон — пиксельный вид по умолчанию.
  open(slides: string[], index: number): void {
    this.slides = slides;
    this.index = index;
    this.isOpen = true;
    this.root.classList.add("pixel", "maximized");
    this.render();
    this.root.classList.remove("hidden");
  }

  // Свои слайды не загрузились — значит их нет в директории, показываем образцы.
  private fallbackToSample(): void {
    if (this.slides === SAMPLE_SLIDES) return;
    this.slides = SAMPLE_SLIDES;
    this.index = 0;
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove("maximized", "pixel");
    this.root.classList.add("hidden");
    this.onClose(this.index);
  }

  private go(d: number): void {
    const next = this.index + d;
    if (next < 0 || next >= this.slides.length) return;
    this.index = next;
    this.render();
  }

  private render(): void {
    this.img.src = this.slides[this.index];
    this.counter.textContent = `${this.index + 1} / ${this.slides.length}`;
    this.prevBtn.disabled = this.index === 0;
    this.nextBtn.disabled = this.index === this.slides.length - 1;
  }

  private togglePixel(): void {
    if (this.root.classList.toggle("pixel")) this.drawPixel();
  }

  // Пикселизация: уменьшаем копию и растягиваем обратно до натурального размера.
  private drawPixel(): void {
    const { naturalWidth: w, naturalHeight: h } = this.img;
    if (!w || !h) return;

    const scale = PIXEL_SIZE / Math.max(w, h);
    const lowW = Math.max(1, Math.round(w * scale));
    const lowH = Math.max(1, Math.round(h * scale));

    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.getContext("2d")!.drawImage(pixelate(this.img, w, h, lowW, lowH), 0, 0);
  }

  isActive(): boolean {
    return this.isOpen;
  }

  handleKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case "ArrowLeft":
        this.go(-1);
        return true;
      case "ArrowRight":
        this.go(1);
        return true;
      case "Escape":
        this.close();
        return true;
      default:
        return false;
    }
  }
}
