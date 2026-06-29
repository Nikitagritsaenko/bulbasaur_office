import { getSpriteImage, type SpriteKey } from "../entities/sprites";

// Логическое поле игры (px). Канвас масштабируется под экран через CSS.
const W = 420;
const H = 640;

const GRAVITY = 0.35;
const JUMP_V = -12;      // скорость отскока от платформы
const SPRING_MULT = 1.6; // усиление отскока от батута на посылке
const MOVE = 5.2;        // горизонтальная скорость
const PLAYER_H = 50;
const HALF_W = 22;       // полширины игрока для столкновений
const PLAT_W = 68;
const PLAT_H = 16;
const GAP_MIN = 70;
const GAP_MAX = 120;
const SCROLL_LINE = H * 0.4; // выше этой линии мир едет вниз, а не игрок вверх

type PlatformType = "box" | "belt";
interface Platform {
  x: number;
  y: number;
  type: PlatformType;
  vx: number;       // скорость для конвейера
  spring: boolean;  // батут (усиленный отскок)
}

// Bulba Jump — аналог Doodle Jump в антураже склада: посылки-платформы,
// ленты-конвейеры, батуты. Игрок — спрайт выбранного персонажа.
export class BulbaJump {
  isOpen = false;
  minimized = false;
  onMinimize: (() => void) | null = null;

  private root = document.getElementById("bulbajump")!;
  private canvas = document.getElementById("bjCanvas") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private statusEl = document.getElementById("bjStatus")!;

  private sprite: HTMLImageElement | null = null;
  private px = 0;
  private py = 0;
  private vx = 0;
  private vy = 0;
  private faceRight = false;
  private platforms: Platform[] = [];
  private score = 0;
  private over = false;
  private left = false;
  private right = false;
  private raf = 0;

  constructor() {
    document.getElementById("bjClose")!.onclick = () => this.close();
    document.getElementById("bjMin")!.onclick = () => this.minimize();
    document.getElementById("bjRestart")!.onclick = () => this.reset();
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
    this.loop();
  }

  // Реальное время: игре нужно состояние «зажато/отпущено», поэтому свои
  // keydown/keyup живут только пока окно открыто (вне общего KeyboardRouter).
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

  open(spriteKey: SpriteKey): void {
    this.sprite = getSpriteImage(spriteKey);
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
    this.px = W / 2;
    this.py = H - 90;
    this.vx = 0;
    this.vy = JUMP_V;
    this.faceRight = false;

    // Стартовая платформа точно под игроком + заполняем поле вверх.
    this.platforms = [{ x: W / 2 - PLAT_W / 2, y: H - 50, type: "box", vx: 0, spring: false }];
    let y = H - 50;
    while (y > 0) {
      y -= GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
      this.platforms.push(this.makePlatform(y));
    }

    this.updateStatus();
    cancelAnimationFrame(this.raf);
    this.loop();
  }

  private makePlatform(y: number): Platform {
    const belt = Math.random() < 0.22;
    return {
      x: Math.random() * (W - PLAT_W),
      y,
      type: belt ? "belt" : "box",
      vx: belt ? (Math.random() < 0.5 ? -1.5 : 1.5) : 0,
      spring: !belt && Math.random() < 0.14,
    };
  }

  private loop = (): void => {
    if (!this.isOpen) return;
    this.step();
    this.render();
    if (!this.over) this.raf = requestAnimationFrame(this.loop);
  };

  private step(): void {
    if (this.over) return;

    this.vx = (this.right ? MOVE : 0) - (this.left ? MOVE : 0);
    if (this.vx !== 0) this.faceRight = this.vx > 0;
    this.px += this.vx;
    // Обёртка по краям экрана, как в Doodle Jump.
    if (this.px < -HALF_W) this.px = W + HALF_W;
    else if (this.px > W + HALF_W) this.px = -HALF_W;

    this.vy += GRAVITY;
    const prevFeet = this.py + PLAYER_H / 2;
    this.py += this.vy;
    const feet = this.py + PLAYER_H / 2;

    for (const p of this.platforms) {
      if (p.type === "belt") {
        p.x += p.vx;
        if (p.x < 0 || p.x > W - PLAT_W) p.vx *= -1;
      }
    }

    // Приземление только при падении и только если ступни прошли верх платформы.
    if (this.vy > 0) {
      for (const p of this.platforms) {
        const overX = this.px + HALF_W > p.x && this.px - HALF_W < p.x + PLAT_W;
        if (overX && prevFeet <= p.y && feet >= p.y) {
          this.py = p.y - PLAYER_H / 2;
          this.vy = JUMP_V * (p.spring ? SPRING_MULT : 1);
          break;
        }
      }
    }

    // Игрок поднялся выше линии — двигаем мир вниз, досыпаем платформы сверху.
    if (this.py < SCROLL_LINE) {
      const dy = SCROLL_LINE - this.py;
      this.py = SCROLL_LINE;
      this.score += dy;
      this.updateStatus();
      for (const p of this.platforms) p.y += dy;
      this.platforms = this.platforms.filter((p) => p.y < H + PLAT_H);
      let top = Math.min(...this.platforms.map((p) => p.y));
      while (top > 0) {
        top -= GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
        this.platforms.push(this.makePlatform(top));
      }
    }

    // Упал ниже экрана — конец.
    if (this.py > H + PLAYER_H) this.over = true;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#0e1620";
    ctx.fillRect(0, 0, W, H);

    // Полки склада — горизонтальные линии с лёгким параллаксом по счёту.
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 2;
    for (let y = (this.score * 6) % 56; y < H; y += 56) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    for (const p of this.platforms) this.drawPlatform(p);
    this.drawPlayer();
    if (this.over) this.drawGameOver();
  }

  private drawPlatform(p: Platform): void {
    const ctx = this.ctx;
    if (p.type === "belt") {
      ctx.fillStyle = "#2f343c";
      ctx.fillRect(p.x, p.y, PLAT_W, PLAT_H);
      ctx.fillStyle = "#7ac07a";
      ctx.fillRect(p.x, p.y, PLAT_W, 3); // активная кромка ленты
      ctx.fillStyle = "#565d68";
      for (let rx = p.x + 6; rx < p.x + PLAT_W - 2; rx += 14) {
        ctx.beginPath();
        ctx.arc(rx, p.y + PLAT_H - 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#c8965a";
      ctx.fillRect(p.x, p.y, PLAT_W, PLAT_H);
      ctx.strokeStyle = "#8a6332";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, PLAT_W - 2, PLAT_H - 2);
      ctx.fillStyle = "#efe2c0"; // скотч крест-накрест
      ctx.fillRect(p.x + PLAT_W / 2 - 5, p.y, 10, PLAT_H);
    }
    if (p.spring) {
      ctx.fillStyle = "#7ac07a";
      ctx.fillRect(p.x + PLAT_W / 2 - 8, p.y - 7, 16, 7);
      ctx.fillStyle = "#5aa05a";
      ctx.fillRect(p.x + PLAT_W / 2 - 8, p.y - 3, 16, 3);
    }
  }

  private drawPlayer(): void {
    if (!this.sprite) return;
    const ctx = this.ctx;
    const h = PLAYER_H;
    const w = this.sprite.height ? (this.sprite.width / this.sprite.height) * h : h;
    const y = this.py - h / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Спрайт по умолчанию смотрит влево; вправо — отзеркаливаем.
    if (this.faceRight) {
      ctx.translate(this.px, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sprite, -w / 2, y, w, h);
    } else {
      ctx.drawImage(this.sprite, this.px - w / 2, y, w, h);
    }
    ctx.restore();
  }

  private drawGameOver(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8,10,14,0.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8efe6";
    ctx.font = "bold 32px 'Trebuchet MS', sans-serif";
    ctx.fillText(`Результат: ${Math.floor(this.score)}`, W / 2, H / 2 + 16);
    ctx.fillStyle = "#7ac07a";
    ctx.font = "15px 'Trebuchet MS', sans-serif";
    ctx.fillText("«Заново» — сыграть ещё раз", W / 2, H / 2 + 48);
  }

  private updateStatus(): void {
    this.statusEl.textContent = `Результат: ${Math.floor(this.score)}`;
  }
}
