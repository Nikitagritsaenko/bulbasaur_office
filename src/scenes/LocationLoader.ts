import Phaser from "phaser";
import { CHARACTERS, type Character } from "../data/characters";
import type { LocationDef } from "../data/locations";
import { spriteScale } from "../entities/sprites";

export interface LoadedLocation {
  npcs: Character[];                      // NPC, стоящие в этой локации
  spawns: Map<string, { x: number; y: number }>; // точки появления из слоя spawns карты
}

// Строит сцену локации: фон, overlay двери, коллизии и NPC. Держит у себя список
// созданных объектов, чтобы снести их при переходе в следующую локацию.
export class LocationLoader {
  private scenery: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private walls: Phaser.Physics.Arcade.StaticGroup,
    private targetH: number,
    private doorOverlayDepth: number,
  ) {}

  load(cfg: LocationDef, locIndex: number, chosenId: string): LoadedLocation {
    this.scenery.forEach((o) => o.destroy());
    this.scenery = [];
    this.walls.clear(true, true);

    this.scenery.push(this.scene.add.image(0, 0, cfg.bg).setOrigin(0).setDepth(0));

    if (cfg.overlay && this.scene.textures.exists(cfg.overlay)) {
      this.scenery.push(
        this.scene.add.image(0, 0, cfg.overlay).setOrigin(0).setDepth(this.doorOverlayDepth),
      );
    }

    const spawns = cfg.map ? this.buildFromMap(cfg.map) : new Map();

    const npcs = cfg.isParking
      ? []
      : CHARACTERS.filter((c) => (c.locationIndex ?? 0) === locIndex && c.id !== chosenId);
    for (const c of npcs) this.addNpc(c);

    return { npcs, spawns };
  }

  // Из карты Tiled: прямоугольники слоя collision -> стены, точки слоя spawns -> точки появления.
  private buildFromMap(mapKey: string): Map<string, { x: number; y: number }> {
    const spawns = new Map<string, { x: number; y: number }>();
    if (!this.scene.cache.tilemap.exists(mapKey)) return spawns;

    const map = this.scene.make.tilemap({ key: mapKey });

    map.getObjectLayer("collision")?.objects.forEach((o) => {
      const w = o.width ?? 0;
      const h = o.height ?? 0;
      const rect = this.scene.add.rectangle((o.x ?? 0) + w / 2, (o.y ?? 0) + h / 2, w, h);
      this.scene.physics.add.existing(rect, true);
      this.walls.add(rect);
    });

    map.getObjectLayer("spawns")?.objects.forEach((o) => {
      spawns.set(o.name, { x: o.x ?? 0, y: o.y ?? 0 });
    });

    return spawns;
  }

  private addNpc(c: Character): void {
    this.scenery.push(
      this.scene.add
        .image(c.x, c.y, c.sprite)
        .setScale(spriteScale(this.scene, c.sprite, this.targetH))
        .setOrigin(0.5, 0.5)
        .setFlipX(!!c.faceRight)
        .setDepth(c.y),
    );
    this.scenery.push(
      this.scene.add
        .text(c.x, c.y - this.targetH * 0.62, c.name, {
          fontFamily: "Trebuchet MS",
          fontSize: "13px",
          color: "#ffffff",
          backgroundColor: "#00000099",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(c.y),
    );
  }
}
