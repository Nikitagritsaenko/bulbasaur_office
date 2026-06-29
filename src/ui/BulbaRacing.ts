// Логическое поле игры (px). Канвас масштабируется под экран через CSS.
const W = 420;
const H = 640;

const ROAD_L = 60;
const ROAD_R = 360;
const LANE_W = 75;
// Центры полос: 0,1 — встречная (слева), 2,3 — попутная (справа). Разделитель x=210.
const LANE_X = [97.5, 172.5, 247.5, 322.5];
const ONCOMING_LANES = [0, 1];
const OUR_LANES = [2, 3];
const DIVIDER_X = 210;

const CAR_W = 36;
const CAR_H = 60;
const PLAYER_Y = H - 130; // экранная позиция игрока (фиксирована)

const PLAYER_VX = 4.2;    // горизонтальная скорость игрока
const VP_MIN = 1.8;
const VP_MAX = 6.6;
const VP_DEFAULT = 3.4;
const VP_ACCEL = 0.09;    // разгон/торможение стрелками вверх/вниз

const SAME_MIN = 1.0;     // скорость попутных npc (медленнее игрока — есть кого обгонять)
const SAME_MAX = 2.8;
const ONC_MIN = 2.2;      // скорость встречных npc
const ONC_MAX = 3.8;

const SPAWN_BASE = 650;   // интервал появления, мс
const SPAWN_MIN = 320;
const SPAWN_DECAY = 18;   // ускорение появления за секунду
const OVERTAKE_POINTS = 10;

const NPC_COLORS: Array<[string, string]> = [
  ["#4f8cc9", "#2b5680"],
  ["#7ac07a", "#4a824a"],
  ["#d9a441", "#9a6f22"],
  ["#b06bd0", "#724489"],
  ["#d96a6a", "#9a3f3f"],
  ["#cdd5df", "#8a93a0"],
];

interface Car {
  x: number;          // центр по X
  y: number;          // центр по Y (экранные)
  oncoming: boolean;  // встречная полоса
  speed: number;      // модуль скорости в мире
  colors: [string, string];
  passed: boolean;    // уже засчитан обгон
}

// Bulba Racing — машинка на оживлённой автостраде. Есть встречная полоса,
// npc едут с разной скоростью по обоим направлениям. Очки — за обгон попутных.
// Управление: влево/вправо — руль, вверх/вниз — газ/тормоз.
export class BulbaRacing {
  isOpen = false;
  minimized = false;
  onMinimize: (() => void) | null = null;

  private root = document.getElementById("bulbaracing")!;
  private canvas = document.getElementById("brCanvas") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private statusEl = document.getElementById("brStatus")!;

  private px = 0;
  private vp = VP_DEFAULT;
  private cars: Car[] = [];
  private score = 0;
  private scrollY = 0;     // смещение разметки для ощущения скорости
  private over = false;

  private left = false;
  private right = false;
  private up = false;
  private down = false;

  private elapsed = 0;
  private spawnTimer = 0;
  private lastT = 0;
  private raf = 0;

  constructor() {
    document.getElementById("brClose")!.onclick = () => this.close();
    document.getElementById("brMin")!.onclick = () => this.minimize();
    document.getElementById("brRestart")!.onclick = () => this.reset();
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

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") { this.left = true; e.preventDefault(); }
    else if (e.code === "ArrowRight" || e.code === "KeyD") { this.right = true; e.preventDefault(); }
    else if (e.code === "ArrowUp" || e.code === "KeyW") { this.up = true; e.preventDefault(); }
    else if (e.code === "ArrowDown" || e.code === "KeyS") { this.down = true; e.preventDefault(); }
    else if (e.code === "Escape") this.close();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") this.left = false;
    else if (e.code === "ArrowRight" || e.code === "KeyD") this.right = false;
    else if (e.code === "ArrowUp" || e.code === "KeyW") this.up = false;
    else if (e.code === "ArrowDown" || e.code === "KeyS") this.down = false;
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
    this.px = LANE_X[OUR_LANES[0]];
    this.vp = VP_DEFAULT;
    this.cars = [];
    this.score = 0;
    this.scrollY = 0;
    this.over = false;
    this.left = this.right = this.up = this.down = false;
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
    const dt = Math.min(now - this.lastT, 50);
    this.lastT = now;
    this.step(dt);
    this.render();
    if (!this.over) this.raf = requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    if (this.over) return;
    const f = dt / 16.67; // нормировка к 60 fps
    this.elapsed += dt;
    const sec = this.elapsed / 1000;

    // Газ/тормоз.
    if (this.up) this.vp += VP_ACCEL * f;
    else if (this.down) this.vp -= VP_ACCEL * f;
    this.vp = Math.max(VP_MIN, Math.min(VP_MAX, this.vp));

    // Руль.
    if (this.left) this.px -= PLAYER_VX * f;
    if (this.right) this.px += PLAYER_VX * f;
    this.px = Math.max(ROAD_L + CAR_W / 2, Math.min(ROAD_R - CAR_W / 2, this.px));

    this.scrollY = (this.scrollY + this.vp * f) % 44;

    // Появление машин.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = Math.max(SPAWN_MIN, SPAWN_BASE - sec * SPAWN_DECAY);
    }

    // Движение npc относительно игрока + обгон + столкновения.
    const next: Car[] = [];
    for (const c of this.cars) {
      // Скорость по экрану: попутные c.speed>0, встречные движутся вниз быстрее.
      const worldUp = c.oncoming ? -c.speed : c.speed;
      c.y += (this.vp - worldUp) * f;

      if (this.collides(c)) {
        this.over = true;
        this.updateStatus();
        return;
      }

      // Обгон попутной машины: была впереди, ушла назад. Обгон по встречной
      // полосе (игрок слева от разделителя) — двойной бонус.
      if (!c.oncoming && !c.passed && c.y > PLAYER_Y + 4) {
        c.passed = true;
        const viaOncoming = this.px < DIVIDER_X;
        this.score += OVERTAKE_POINTS * (viaOncoming ? 2 : 1);
        this.updateStatus();
      }

      if (c.y < -CAR_H || c.y > H + CAR_H) continue; // ушла за экран
      next.push(c);
    }
    this.cars = next;
  }

  private spawn(): void {
    const oncoming = Math.random() < 0.45;
    const lane = oncoming
      ? ONCOMING_LANES[Math.floor(Math.random() * ONCOMING_LANES.length)]
      : OUR_LANES[Math.floor(Math.random() * OUR_LANES.length)];
    const x = LANE_X[lane];

    // Не спавнить, если в этой полосе уже есть машина у верхнего края.
    for (const c of this.cars) {
      if (Math.abs(c.x - x) < 4 && c.y < CAR_H * 1.6) return;
    }

    const speed = oncoming
      ? ONC_MIN + Math.random() * (ONC_MAX - ONC_MIN)
      : SAME_MIN + Math.random() * (SAME_MAX - SAME_MIN);

    this.cars.push({
      x,
      y: -CAR_H,
      oncoming,
      speed,
      colors: NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)],
      passed: false,
    });
  }

  private collides(c: Car): boolean {
    return Math.abs(c.x - this.px) < CAR_W - 8 && Math.abs(c.y - PLAYER_Y) < CAR_H - 8;
  }

  private render(): void {
    const ctx = this.ctx;
    // Обочина-газон.
    ctx.fillStyle = "#2f5d3a";
    ctx.fillRect(0, 0, W, H);
    // Дорога.
    ctx.fillStyle = "#3a3f47";
    ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
    // Бордюры.
    ctx.fillStyle = "#cdd5df";
    ctx.fillRect(ROAD_L - 4, 0, 4, H);
    ctx.fillRect(ROAD_R, 0, 4, H);

    // Пунктир между однонаправленными полосами.
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 4;
    ctx.setLineDash([22, 22]);
    ctx.lineDashOffset = -this.scrollY;
    for (const lx of [LANE_X[0] + LANE_W / 2, LANE_X[2] + LANE_W / 2]) {
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Двойная сплошная по центру (разделение направлений).
    ctx.strokeStyle = "#e8c83c";
    ctx.lineWidth = 3;
    for (const dx of [-3, 3]) {
      ctx.beginPath();
      ctx.moveTo(DIVIDER_X + dx, 0);
      ctx.lineTo(DIVIDER_X + dx, H);
      ctx.stroke();
    }

    for (const c of this.cars) this.drawCar(c.x, c.y, c.colors, c.oncoming);
    this.drawCar(this.px, PLAYER_Y, ["#e0533a", "#7a2d1c"], false, true);

    this.drawHud();
    if (this.over) this.drawGameOver();
  }

  // Машина видом сверху. facingDown — нос направлен вниз (встречные едут на нас).
  private drawCar(cx: number, cy: number, colors: [string, string], facingDown: boolean, isPlayer = false): void {
    const ctx = this.ctx;
    const x = cx - CAR_W / 2;
    const y = cy - CAR_H / 2;
    ctx.fillStyle = colors[0];
    this.roundRect(x, y, CAR_W, CAR_H, 7);
    ctx.fill();
    ctx.strokeStyle = colors[1];
    ctx.lineWidth = 2;
    this.roundRect(x + 1, y + 1, CAR_W - 2, CAR_H - 2, 6);
    ctx.stroke();

    // Лобовое стекло у носа.
    ctx.fillStyle = "#bfe0f0";
    const wsH = 12;
    const wsY = facingDown ? y + CAR_H - wsH - 5 : y + 5;
    ctx.fillRect(x + 6, wsY, CAR_W - 12, wsH);
    // Крыша.
    ctx.fillStyle = colors[1];
    ctx.fillRect(x + 7, facingDown ? y + 8 : y + CAR_H - 26, CAR_W - 14, 18);

    if (isPlayer) {
      ctx.strokeStyle = "#ffd86b";
      ctx.lineWidth = 2;
      this.roundRect(x - 1, y - 1, CAR_W + 2, CAR_H + 2, 8);
      ctx.stroke();
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawHud(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#0b0f17";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, W, 30);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e8eef6";
    ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`Очки: ${this.score}`, 12, 16);
    ctx.textAlign = "right";
    const kmh = Math.round(this.vp * 38);
    ctx.fillText(`${kmh} км/ч`, W - 12, 16);
  }

  private drawGameOver(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8,10,14,0.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e8a0a0";
    ctx.font = "bold 32px 'Trebuchet MS', sans-serif";
    ctx.fillText("Авария!", W / 2, H / 2 - 24);
    ctx.fillStyle = "#e8eef6";
    ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
    ctx.fillText(`Очки: ${this.score}`, W / 2, H / 2 + 6);
    ctx.fillStyle = "#cdd5df";
    ctx.font = "15px 'Trebuchet MS', sans-serif";
    ctx.fillText("«Заново» — сыграть ещё раз", W / 2, H / 2 + 38);
  }

  private updateStatus(): void {
    this.statusEl.textContent = this.over ? `Авария! Очки: ${this.score}` : `Очки: ${this.score}`;
  }
}
