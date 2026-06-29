// Логическое поле игры (px). Канвас масштабируется под экран через CSS.
const W = 480;
const H = 640;
const WALL = 14;              // толщина внешних стен; в них врезаться нельзя

// Геометрия фуры: тягач (cab) + прицеп, вид сверху.
const TRUCK_W = 26;          // ширина кузова
const CAB_LEN = 44;
const TRAILER_LEN = 96;
const L = 30;                // колёсная база тягача (для поворота)
const LT = 78;               // длина прицепа для кинематики
const CAB_FWD = 15;          // центр кабины впереди задней оси тягача
const TRAILER_BACK = TRAILER_LEN / 2; // центр прицепа позади сцепки

const STEER_MAX = 0.55;
const STEER_SPEED = 0.075;
const ACCEL = 0.09;
const FRICTION = 0.06;
const VMAX = 2.2;            // макс. вперёд
const VREV = 1.5;            // макс. назад

interface Obb { cx: number; cy: number; hw: number; hh: number; a: number }

// Угловая парковка: фура встаёт под наклоном, носом вверх-влево. Заезжать надо
// из поворота, в проём между уже припаркованными грузовиками.
const SLOT_A = (-Math.PI * 3) / 4;       // целевой курс запаркованной фуры (вверх-влево)
const SLOT = { cx: 280, cy: 200, hw: 70, hh: 15, a: SLOT_A }; // зона зачёта (по габаритам фуры)
const PARK_MARGIN = 6;                   // допустимый вылет фуры за место (px) для зачёта
const PARKED_HW = 67;
const PARKED_HH = 14;
const PITCH = 46;                        // шаг между соседними местами
// Смещения кабины и прицепа от геометрического центра фуры (для отрисовки чужих машин).
const CAB_OFF = 44.5;
const TRAILER_OFF = 18.5;

// Чужие грузовики на соседних местах (параллельны нашему). k — смещение места.
const PARKED: Obb[] = [-1, 1, 2, 3].map((k) => ({
  cx: SLOT.cx + k * PITCH * Math.cos(SLOT_A + Math.PI / 2),
  cy: SLOT.cy + k * PITCH * Math.sin(SLOT_A + Math.PI / 2),
  hw: PARKED_HW,
  hh: PARKED_HH,
  a: SLOT_A,
}));

const ALIGN_TOL = 0.35; // допустимое отклонение курса фуры от курса места (рад)

// Bulba Parking — припарковать дальнобойную фуру в угловой проём между чужими
// грузовиками, не задев их и стены. Управление стрелками. Время идёт с первого
// нажатия любой стрелки.
export class BulbaParking {
  isOpen = false;
  minimized = false;
  onMinimize: (() => void) | null = null;

  private root = document.getElementById("bulbaparking")!;
  private canvas = document.getElementById("bpkCanvas") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private statusEl = document.getElementById("bpkStatus")!;

  // Состояние фуры: A — задняя ось тягача (точка интегрирования и сцепки).
  private ax = 0;
  private ay = 0;
  private theta = 0;   // курс тягача
  private phi = 0;     // курс прицепа
  private v = 0;       // скорость вдоль курса тягача
  private steer = 0;

  private up = false;
  private down = false;
  private left = false;
  private right = false;

  private over = false;
  private won = false;

  private timerOn = false;
  private startT = 0;
  private elapsedMs = 0;

  private lastT = 0;
  private raf = 0;

  constructor() {
    document.getElementById("bpkClose")!.onclick = () => this.close();
    document.getElementById("bpkMin")!.onclick = () => this.minimize();
    document.getElementById("bpkRestart")!.onclick = () => this.reset();
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
    this.startT = performance.now() - this.elapsedMs; // не засчитываем время на паузе
    this.loop();
  }

  // Игре нужно состояние «зажато/отпущено», поэтому свои keydown/keyup живут
  // только пока окно открыто (вне общего KeyboardRouter).
  private onKeyDown = (e: KeyboardEvent): void => {
    let arrow = true;
    if (e.code === "ArrowUp" || e.code === "KeyW") this.up = true;
    else if (e.code === "ArrowDown" || e.code === "KeyS") this.down = true;
    else if (e.code === "ArrowLeft" || e.code === "KeyA") this.left = true;
    else if (e.code === "ArrowRight" || e.code === "KeyD") this.right = true;
    else arrow = false;

    if (arrow) {
      e.preventDefault();
      if (!this.timerOn && !this.over) {
        this.timerOn = true;
        this.startT = performance.now();
      }
    } else if (e.code === "Escape") {
      this.close();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "ArrowUp" || e.code === "KeyW") this.up = false;
    else if (e.code === "ArrowDown" || e.code === "KeyS") this.down = false;
    else if (e.code === "ArrowLeft" || e.code === "KeyA") this.left = false;
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
    this.ax = 120;
    this.ay = 500;
    this.theta = -Math.PI / 4; // в нижнем левом углу, носом вверх-вправо
    this.phi = -Math.PI / 4;
    this.v = 0;
    this.steer = 0;
    this.up = this.down = this.left = this.right = false;
    this.over = false;
    this.won = false;
    this.timerOn = false;
    this.startT = 0;
    this.elapsedMs = 0;
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

    if (this.timerOn) this.elapsedMs = performance.now() - this.startT;

    // Руль.
    if (this.left) this.steer -= STEER_SPEED * f;
    else if (this.right) this.steer += STEER_SPEED * f;
    else this.steer -= Math.sign(this.steer) * Math.min(Math.abs(this.steer), STEER_SPEED * f);
    this.steer = Math.max(-STEER_MAX, Math.min(STEER_MAX, this.steer));

    // Газ/тормоз.
    if (this.up) this.v += ACCEL * f;
    else if (this.down) this.v -= ACCEL * f;
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), FRICTION * f);
    this.v = Math.max(-VREV, Math.min(VMAX, this.v));

    // Кинематика тягача с прицепом.
    this.ax += this.v * Math.cos(this.theta) * f;
    this.ay += this.v * Math.sin(this.theta) * f;
    this.theta += (this.v / L) * Math.tan(this.steer) * f;
    this.phi += (this.v / LT) * Math.sin(this.theta - this.phi) * f;

    const cab = this.cabObb();
    const trailer = this.trailerObb();

    if (this.hits(cab) || this.hits(trailer)) {
      this.over = true;
      this.won = false;
      this.updateStatus();
      return;
    }

    if (this.isParked(cab, trailer)) {
      this.over = true;
      this.won = true;
      this.v = 0;
      this.updateStatus();
    }
  }

  private cabObb(): Obb {
    return {
      cx: this.ax + CAB_FWD * Math.cos(this.theta),
      cy: this.ay + CAB_FWD * Math.sin(this.theta),
      hw: CAB_LEN / 2,
      hh: TRUCK_W / 2,
      a: this.theta,
    };
  }

  private trailerObb(): Obb {
    return {
      cx: this.ax - TRAILER_BACK * Math.cos(this.phi),
      cy: this.ay - TRAILER_BACK * Math.sin(this.phi),
      hw: TRAILER_LEN / 2,
      hh: TRUCK_W / 2,
      a: this.phi,
    };
  }

  // Припаркована: вся фура (все углы тягача и прицепа) внутри места с небольшим
  // запасом, и курс выровнен по месту. Половина кузова в зоне уже не считается.
  private isParked(cab: Obb, trailer: Obb): boolean {
    return (
      this.fullyInSlot(cab) &&
      this.fullyInSlot(trailer) &&
      Math.abs(this.angleDiff(this.theta, SLOT_A)) < ALIGN_TOL &&
      Math.abs(this.angleDiff(this.phi, SLOT_A)) < ALIGN_TOL
    );
  }

  private fullyInSlot(o: Obb): boolean {
    for (const [x, y] of this.corners(o)) {
      if (!this.pointInObb(x, y, SLOT, PARK_MARGIN)) return false;
    }
    return true;
  }

  private corners(o: Obb): Array<[number, number]> {
    const c = Math.cos(o.a), s = Math.sin(o.a);
    const ux = c * o.hw, uy = s * o.hw;     // вектор полудлины вдоль курса
    const vx = -s * o.hh, vy = c * o.hh;    // вектор полуширины
    return [
      [o.cx + ux + vx, o.cy + uy + vy],
      [o.cx + ux - vx, o.cy + uy - vy],
      [o.cx - ux - vx, o.cy - uy - vy],
      [o.cx - ux + vx, o.cy - uy + vy],
    ];
  }

  private hits(o: Obb): boolean {
    const pts = this.corners(o);
    for (const [x, y] of pts) {
      if (x < WALL || x > W - WALL || y < WALL || y > H - WALL) return true;
    }
    for (const p of PARKED) {
      if (this.obbOverlap(o, p)) return true;
    }
    return false;
  }

  // SAT двух повёрнутых прямоугольников.
  private obbOverlap(a: Obb, b: Obb): boolean {
    const axes: Array<[number, number]> = [
      [Math.cos(a.a), Math.sin(a.a)],
      [-Math.sin(a.a), Math.cos(a.a)],
      [Math.cos(b.a), Math.sin(b.a)],
      [-Math.sin(b.a), Math.cos(b.a)],
    ];
    const ca = this.corners(a);
    const cb = this.corners(b);
    for (const [axx, axy] of axes) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, y] of ca) {
        const p = x * axx + y * axy;
        a0 = Math.min(a0, p); a1 = Math.max(a1, p);
      }
      for (const [x, y] of cb) {
        const p = x * axx + y * axy;
        b0 = Math.min(b0, p); b1 = Math.max(b1, p);
      }
      if (a1 < b0 || b1 < a0) return false;
    }
    return true;
  }

  private pointInObb(x: number, y: number, o: Obb, margin = 0): boolean {
    const dx = x - o.cx, dy = y - o.cy;
    const c = Math.cos(o.a), s = Math.sin(o.a);
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    return Math.abs(lx) <= o.hw + margin && Math.abs(ly) <= o.hh + margin;
  }

  private angleDiff(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#26303a"; // асфальт
    ctx.fillRect(0, 0, W, H);

    // Стены по периметру.
    ctx.fillStyle = "#3a4350";
    ctx.fillRect(0, 0, W, WALL);
    ctx.fillRect(0, H - WALL, W, WALL);
    ctx.fillRect(0, 0, WALL, H);
    ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.strokeStyle = "rgba(240,200,60,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(WALL, WALL, W - 2 * WALL, H - 2 * WALL);

    // Зона парковки (наклонная).
    ctx.save();
    ctx.translate(SLOT.cx, SLOT.cy);
    ctx.rotate(SLOT_A);
    ctx.fillStyle = "rgba(122,192,122,0.16)";
    ctx.fillRect(-SLOT.hw, -SLOT.hh, SLOT.hw * 2, SLOT.hh * 2);
    ctx.strokeStyle = "#7ac07a";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(-SLOT.hw, -SLOT.hh, SLOT.hw * 2, SLOT.hh * 2);
    ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle = "#7ac07a";
    ctx.font = "bold 30px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("P", SLOT.cx, SLOT.cy);

    // Чужие грузовики — той же отрисовкой, что наш, но в серых тонах.
    for (const p of PARKED) {
      const c = Math.cos(p.a), s = Math.sin(p.a);
      const cab: Obb = { cx: p.cx + CAB_OFF * c, cy: p.cy + CAB_OFF * s, hw: CAB_LEN / 2, hh: TRUCK_W / 2, a: p.a };
      const trailer: Obb = { cx: p.cx - TRAILER_OFF * c, cy: p.cy - TRAILER_OFF * s, hw: TRAILER_LEN / 2, hh: TRUCK_W / 2, a: p.a };
      this.drawTruckParts(trailer, cab, "#6d7884", "#3a4350", "#9aa3ad", "#4a525c");
    }

    this.drawTruck();
    this.drawTimer();
    if (this.over) this.drawGameOver();
  }

  private drawTruck(): void {
    this.drawTruckParts(this.trailerObb(), this.cabObb(), "#3d6ea5", "#21384f", "#c0492f", "#7a2d1c");
  }

  // Артикулированная фура: прицеп с рёбрами + кабина с лобовым стеклом и сцепкой.
  private drawTruckParts(trailer: Obb, cab: Obb, tFill: string, tStroke: string, cFill: string, cStroke: string): void {
    const ctx = this.ctx;

    // Сцепка между передом прицепа и задом кабины.
    ctx.strokeStyle = "#2a2f36";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(trailer.cx + trailer.hw * Math.cos(trailer.a), trailer.cy + trailer.hw * Math.sin(trailer.a));
    ctx.lineTo(cab.cx - cab.hw * Math.cos(cab.a), cab.cy - cab.hw * Math.sin(cab.a));
    ctx.stroke();

    // Прицеп-контейнер с рёбрами.
    ctx.save();
    ctx.translate(trailer.cx, trailer.cy);
    ctx.rotate(trailer.a);
    ctx.fillStyle = tFill;
    ctx.fillRect(-trailer.hw, -trailer.hh, trailer.hw * 2, trailer.hh * 2);
    ctx.strokeStyle = tStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(-trailer.hw, -trailer.hh, trailer.hw * 2, trailer.hh * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let lx = -trailer.hw + 12; lx < trailer.hw; lx += 14) {
      ctx.beginPath();
      ctx.moveTo(lx, -trailer.hh);
      ctx.lineTo(lx, trailer.hh);
      ctx.stroke();
    }
    ctx.restore();

    // Тягач с лобовым стеклом.
    ctx.save();
    ctx.translate(cab.cx, cab.cy);
    ctx.rotate(cab.a);
    ctx.fillStyle = cFill;
    ctx.fillRect(-cab.hw, -cab.hh, cab.hw * 2, cab.hh * 2);
    ctx.strokeStyle = cStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(-cab.hw, -cab.hh, cab.hw * 2, cab.hh * 2);
    ctx.fillStyle = "#bfe0f0";
    ctx.fillRect(cab.hw - 10, -cab.hh + 3, 6, cab.hh * 2 - 6);
    ctx.restore();
  }

  private drawTimer(): void {
    const ctx = this.ctx;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#e8eef6";
    ctx.fillText(this.formatTime(), WALL + 10, H - WALL - 12);
  }

  private formatTime(): string {
    return (this.elapsedMs / 1000).toFixed(1) + " с";
  }

  private drawGameOver(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8,10,14,0.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = this.won ? "#7ac07a" : "#e8a0a0";
    ctx.font = "bold 30px 'Trebuchet MS', sans-serif";
    ctx.fillText(this.won ? "Припарковано!" : "Бам! Задел", W / 2, H / 2 - 24);
    if (this.won) {
      ctx.fillStyle = "#e8eef6";
      ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
      ctx.fillText(`Время: ${this.formatTime()}`, W / 2, H / 2 + 6);
    }
    ctx.fillStyle = "#cdd5df";
    ctx.font = "15px 'Trebuchet MS', sans-serif";
    ctx.fillText("«Заново» — сыграть ещё раз", W / 2, H / 2 + 38);
  }

  private updateStatus(): void {
    if (this.over) {
      this.statusEl.textContent = this.won
        ? `Припарковано за ${this.formatTime()}`
        : "Задел — попробуй заново";
    } else {
      this.statusEl.textContent = "Стрелки: газ, задний ход и руль. Время — с первого нажатия";
    }
  }
}
