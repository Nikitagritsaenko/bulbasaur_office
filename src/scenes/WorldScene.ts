import Phaser from "phaser";
import { CHARACTERS, type Character } from "../data/characters";
import { LOCATIONS, type ExitDef } from "../data/locations";
import { registerSpriteImages, spriteScale } from "../entities/sprites";
import { Dialogue } from "../ui/Dialogue";
import { SpeechBubble } from "../ui/SpeechBubble";
import { SlideViewer } from "../ui/SlideViewer";
import { Projector } from "../ui/Projector";
import { LocationMenu } from "../ui/LocationMenu";
import { KeyboardRouter } from "../ui/KeyboardRouter";
import { showCharacterSelect } from "../ui/CharacterSelect";
import { LocationLoader } from "./LocationLoader";

const SPEED = 400;
const INTERACT_DIST = 80;
const TARGET_H = 74;   // экранная высота персонажа в пикселях

const DEPTH = {
  prompt: 1_000_000,
  player: 1_000_001,
  doorOverlay: 2_000_000,
  bubble: 3_000_000,
} as const;

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private npcs: Character[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private router!: KeyboardRouter;
  private loader!: LocationLoader;
  private dialogue!: Dialogue;
  private bubble!: SpeechBubble;
  private slides!: SlideViewer;
  private projector!: Projector;
  private prompt!: Phaser.GameObjects.Text;
  private nearest: Character | null = null;
  private talking: Character | null = null;
  private started = false;

  private chosen!: Character;
  private locIndex = 0;
  private atParking = false;
  private menu!: LocationMenu;
  private exitBtn = document.getElementById("exitBtn") as HTMLButtonElement;
  private exitLabel = document.getElementById("exitLabel") as HTMLSpanElement;
  private currentExit: ExitDef | null = null;

  constructor() {
    super("World");
  }

  create(): void {
    registerSpriteImages(this);
    this.walls = this.physics.add.staticGroup();
    this.router = new KeyboardRouter();
    this.loader = new LocationLoader(this, this.walls, TARGET_H, DEPTH.doorOverlay);

    this.bubble = new SpeechBubble(this, DEPTH.bubble);
    this.projector = new Projector(this, (slides, index) => {
      this.dialogue.paused = true;
      this.slides.open(slides, index);
    });
    this.slides = new SlideViewer((index) => {
      this.dialogue.paused = false;
      this.projector.setIndex(index);
    });
    this.dialogue = new Dialogue({
      onSay: (text) => {
        if (this.talking) this.bubble.show(text, this.talking.x, this.talking.y - TARGET_H / 2);
      },
      onShowSlides: (npc) => this.projector.show(npc),
      onClose: () => {
        this.bubble.hide();
        this.projector.hide();
      },
    });

    this.prompt = this.add
      .text(0, 0, "Пробел — поговорить", {
        fontFamily: "Trebuchet MS",
        fontSize: "14px",
        color: "#7ac07a",
        backgroundColor: "#000000c0",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.prompt)
      .setVisible(false);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;

    this.menu = new LocationMenu((to, spawn) => this.goTo(to, spawn));

    // Потребители ввода по приоритету: слайды поверх диалога поверх меню парковки,
    // ниже — выход в дверь по Enter (когда нет модалок и игрок стоит в зоне выхода).
    this.router.register(this.slides);
    this.router.register(this.dialogue);
    this.router.register(this.menu);
    this.router.register({
      isActive: () =>
        this.started && !this.atParking && !this.dialogue.isOpen && this.currentExit !== null,
      handleKey: (e) => {
        if (e.code !== "Enter") return false;
        this.triggerExit();
        return true;
      },
    });

    this.exitBtn.onclick = () => this.triggerExit();

    showCharacterSelect(CHARACTERS, (chosen) => this.startAs(chosen));
  }

  private startAs(chosen: Character): void {
    this.chosen = chosen;
    this.player = this.physics.add.sprite(chosen.x, chosen.y, chosen.sprite);
    this.player.setScale(spriteScale(this, chosen.sprite, TARGET_H)).setDepth(DEPTH.player);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.walls);

    // Игрок стартует на позиции своего персонажа в главном офисе — спавн не задаём.
    this.loadLocation(0);
    this.started = true;
  }

  // Строит локацию index, снося предыдущую. Если задан spawnName — ставит игрока
  // в одноимённую точку слоя spawns этой локации.
  private loadLocation(index: number, spawnName?: string): void {
    const cfg = LOCATIONS[index];
    this.locIndex = index;
    this.atParking = !!cfg.isParking;

    const { npcs, spawns } = this.loader.load(cfg, index, this.chosen.id);
    this.npcs = npcs;

    this.player.setVisible(!this.atParking);
    if (this.atParking) {
      // На парковке ходить нельзя — прячем игрока и показываем меню локаций.
      this.player.setVelocity(0);
      this.menu.show(cfg);
    } else {
      this.menu.hide();
      if (spawnName !== undefined) {
        const p = spawns.get(spawnName);
        if (p) this.player.setPosition(p.x, p.y);
      }
    }
  }

  private goTo(to: number, spawn: string): void {
    this.showExit(null);
    this.loadLocation(to, spawn);
  }

  private triggerExit(): void {
    if (this.currentExit) this.goTo(this.currentExit.to, this.currentExit.spawn);
  }

  private showExit(exit: ExitDef | null): void {
    if (exit === this.currentExit) return;
    this.currentExit = exit;
    if (exit) {
      this.exitLabel.textContent = LOCATIONS[exit.to].enterLabel;
      this.exitBtn.classList.remove("hidden");
    } else {
      this.exitBtn.classList.add("hidden");
    }
  }

  // Первый выход, в зоне которого находится игрок.
  private findExit(): ExitDef | null {
    for (const exit of LOCATIONS[this.locIndex].exits) {
      const z = exit.zone;
      if (
        this.player.x >= z.x &&
        this.player.x <= z.x + z.w &&
        this.player.y >= z.y &&
        this.player.y <= z.y + z.h
      ) {
        return exit;
      }
    }
    return null;
  }

  update(): void {
    if (!this.started) return;

    // На парковке управление недоступно — работает только меню.
    if (this.atParking) {
      this.player.setVelocity(0);
      this.prompt.setVisible(false);
      this.showExit(null);
      return;
    }

    if (this.dialogue.isOpen) {
      this.player.setVelocity(0);
      this.prompt.setVisible(false);
      this.showExit(null);
      return;
    }

    this.player.setVelocity(0);
    if (this.cursors.left.isDown || this.keys.A.isDown) {
      this.player.setVelocityX(-SPEED);
      this.player.setFlipX(false);
    } else if (this.cursors.right.isDown || this.keys.D.isDown) {
      this.player.setVelocityX(SPEED);
      this.player.setFlipX(true);
    }
    if (this.cursors.up.isDown || this.keys.W.isDown) this.player.setVelocityY(-SPEED);
    else if (this.cursors.down.isDown || this.keys.S.isDown) this.player.setVelocityY(SPEED);
    this.player.body.velocity.normalize().scale(SPEED);

    this.nearest = null;
    let best = INTERACT_DIST;
    for (const c of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
      if (d < best) {
        best = d;
        this.nearest = c;
      }
    }

    if (this.nearest) {
      this.prompt.setPosition(this.nearest.x, this.nearest.y - TARGET_H * 0.85).setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
        this.talking = this.nearest;
        this.dialogue.open(this.nearest);
      }
    } else {
      this.prompt.setVisible(false);
    }

    this.showExit(this.findExit());
  }
}
