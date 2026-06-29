// Логическое поле игры (px). Канвас масштабируется под экран через CSS.
const W = 480;
const H = 600;

const BOX_W = 96;
const BOX_H = 58;
const BOX_Y = H - BOX_H - 6;      // коробка стоит у нижнего края
const BOX_MOVE = 6.4;             // горизонтальная скорость коробки

const ITEM = 46;                  // размер падающего предмета (квадрат)
const CATCH_POINTS = 10;          // фиксированные очки за пойманный товар
const BOMB_CHANCE = 0.18;         // доля бомбочек среди падающих предметов

const ITEM_COUNT = 6;             // item1.png ... item6.png в public/assets/items
const FALL_BASE = 2.4;            // стартовая скорость падения
const FALL_GROWTH = 0.045;        // прирост скорости за секунду
const SPAWN_BASE = 950;           // стартовый интервал появления (мс)
const SPAWN_MIN = 320;            // минимальный интервал появления (мс)
const SPAWN_DECAY = 22;           // ускорение появления за секунду (мс/с)

interface FallItem {
  x: number;       // центр по X
  y: number;       // центр по Y
  vy: number;
  bomb: boolean;
  img: HTMLImageElement | null; // картинка товара; null у бомбы (рисуется вручную)
}

// Bulba Packer — сверху в коробку летят товары. Хорошие предметы ловим и
// получаем очки, бомбочки ловить нельзя. Со временем падения ускоряются.
export class BulbaPacker {
  isOpen = false;
  minimized = false;
  onMinimize: (() => void) | null = null;

  private root = document.getElementById("bulbapacker")!;
  private canvas = document.getElementById("bpCanvas") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private statusEl = document.getElementById("bpStatus")!;

  private items: HTMLImageElement[] = [];
  private boxX = 0;
  private falling: FallItem[] = [];
  private score = 0;
  private over = false;
  private left = false;
  private right = false;
  private elapsed = 0;          // мс с начала партии
  private spawnTimer = 0;       // мс до следующего появления
  private lastT = 0;
  private raf = 0;

  constructor() {
    document.getElementById("bpClose")!.onclick = () => this.close();
    document.getElementById("bpMin")!.onclick = () => this.minimize();
    document.getElementById("bpRestart")!.onclick = () => this.reset();
    for (let i = 1; i <= ITEM_COUNT; i++) {
      const img = new Image();
      img.src = `/assets/items/item${i}.png`;
      this.items.push(img);
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  // Свернуть: ставим игру на паузу, отключаем её управление и прячем окно. На TV
  // остаётся последний кадр; игра не мешает ходить и ждёт, когда её развернут.
  minimize(): void {
    if (!this.isOpen || this.minimized) return;
    this.minimized = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.root.classList.add("hidden");
    this.onMinimize?.();
  }

  restore(): void {
    if (!this.minimized) return;
    this.minimized = false;
    this.root.classList.remove("hidden");
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.lastT = performance.now();
    this.loop();
  }

  // Игре нужно состояние «зажато/отпущено», поэтому свои keydown/keyup живут
  // только пока окно открыто (вне общего KeyboardRouter).
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      this.left = true;
      e.preventDefault();
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      this.right = true;
      e.preventDefault();
    } else if (e.code === "Escape") {
      this.close();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") this.left = false;
    else if (e.code === "ArrowRight" || e.code === "KeyD") this.right = false;
  };

  open(): void {
    this.isOpen = true;
    this.root.classList.remove("hidden");
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.reset();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.minimized = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.root.classList.add("hidden");
  }

  private reset(): void {
    this.score = 0;
    this.over = false;
    this.left = this.right = false;
    this.boxX = (W - BOX_W) / 2;
    this.falling = [];
    this.elapsed = 0;
    this.spawnTimer = SPAWN_BASE;
    this.lastT = performance.now();

    this.updateStatus();
    cancelAnimationFrame(this.raf);
    this.loop();
  }

  private loop = (): void => {
    if (!this.isOpen) return;
    const now = performance.now();
    const dt = Math.min(now - this.lastT, 50); // защита от больших скачков (вкладка свернута)
    this.lastT = now;
    this.step(dt);
    this.render();
    if (!this.over) this.raf = requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    if (this.over) return;
    this.elapsed += dt;
    const sec = this.elapsed / 1000;
    const frame = dt / 16.67; // нормировка к 60 fps

    // Движение коробки.
    const dir = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    this.boxX += dir * BOX_MOVE * frame;
    if (this.boxX < 0) this.boxX = 0;
    else if (this.boxX > W - BOX_W) this.boxX = W - BOX_W;

    // Появление новых предметов с ускорением со временем.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      const interval = Math.max(SPAWN_MIN, SPAWN_BASE - sec * SPAWN_DECAY);
      this.spawnTimer = interval;
    }

    // Падение и ловля.
    const boxTop = BOX_Y;
    const next: FallItem[] = [];
    for (const it of this.falling) {
      it.y += it.vy * frame;
      const overX = it.x > this.boxX && it.x < this.boxX + BOX_W;
      const reached = it.y + ITEM / 2 >= boxTop;
      if (reached && overX) {
        // Предмет попал в коробку.
        if (it.bomb) {
          this.over = true;
          return;
        }
        this.score += CATCH_POINTS;
        this.updateStatus();
        continue; // пойман — убираем
      }
      if (it.y - ITEM / 2 > H) continue; // улетел ниже экрана — убираем
      next.push(it);
    }
    this.falling = next;
  }

  private spawn(): void {
    const bomb = Math.random() < BOMB_CHANCE;
    const sec = this.elapsed / 1000;
    const vy = FALL_BASE + sec * FALL_GROWTH + Math.random() * 0.6;
    this.falling.push({
      x: ITEM / 2 + Math.random() * (W - ITEM),
      y: -ITEM,
      vy,
      bomb,
      img: bomb ? null : this.items[Math.floor(Math.random() * this.items.length)],
    });
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#0e1620";
    ctx.fillRect(0, 0, W, H);

    // Пол склада.
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, H - 8, W, 8);

    for (const it of this.falling) this.drawItem(it);
    this.drawBox();
    if (this.over) this.drawGameOver();
  }

  private drawItem(it: FallItem): void {
    const ctx = this.ctx;
    const x = it.x - ITEM / 2;
    const y = it.y - ITEM / 2;
    if (it.bomb) {
      // Бомба рисуется вручную, чтобы всегда читалась как «не лови».
      ctx.fillStyle = "#6b727d";
      ctx.beginPath();
      ctx.arc(it.x, it.y + 4, ITEM / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9aa1ab"; // блик
      ctx.beginPath();
      ctx.arc(it.x - 6, it.y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#9a6b3a"; // фитиль
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(it.x + 6, it.y - ITEM / 2 + 6);
      ctx.lineTo(it.x + 12, it.y - ITEM / 2 - 2);
      ctx.stroke();
      ctx.fillStyle = "#ffb347"; // искра
      ctx.beginPath();
      ctx.arc(it.x + 13, it.y - ITEM / 2 - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (it.img && it.img.complete && it.img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(it.img, x, y, ITEM, ITEM);
    } else {
      // Запасной вид, пока картинка не загрузилась.
      ctx.fillStyle = "#c8965a";
      ctx.fillRect(x, y, ITEM, ITEM);
    }
  }

  private drawBox(): void {
    const ctx = this.ctx;
    const x = this.boxX;
    // Корпус коробки.
    ctx.fillStyle = "#c8965a";
    ctx.fillRect(x, BOX_Y, BOX_W, BOX_H);
    ctx.strokeStyle = "#8a6332";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, BOX_Y + 1.5, BOX_W - 3, BOX_H - 3);
    // Тёмная пустота сверху — открытая коробка.
    ctx.fillStyle = "#5e4423";
    ctx.fillRect(x + 6, BOX_Y, BOX_W - 12, 8);
    // Открытые клапаны по краям.
    ctx.fillStyle = "#d9a96a";
    ctx.beginPath();
    ctx.moveTo(x, BOX_Y);
    ctx.lineTo(x - 14, BOX_Y - 12);
    ctx.lineTo(x + 4, BOX_Y - 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + BOX_W, BOX_Y);
    ctx.lineTo(x + BOX_W + 14, BOX_Y - 12);
    ctx.lineTo(x + BOX_W - 4, BOX_Y - 4);
    ctx.fill();
  }

  private drawGameOver(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8,10,14,0.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8efe6";
    ctx.font = "bold 32px 'Trebuchet MS', sans-serif";
    ctx.fillText("Поймал бомбу!", W / 2, H / 2 - 18);
    ctx.font = "20px 'Trebuchet MS', sans-serif";
    ctx.fillText(`Результат: ${this.score}`, W / 2, H / 2 + 16);
    ctx.fillStyle = "#7ac07a";
    ctx.font = "15px 'Trebuchet MS', sans-serif";
    ctx.fillText("«Заново» — сыграть ещё раз", W / 2, H / 2 + 48);
  }

  private updateStatus(): void {
    this.statusEl.textContent = `Очки: ${this.score}`;
  }
}
