import Phaser from "phaser";
import { CHARACTERS, type Character } from "../data/characters";
import type { LocationDef } from "../data/locations";
import { spriteScale } from "../entities/sprites";

export type Spawn = { x: number; y: number };

// NPC вместе с его позицией на карте (позиция берётся из слоя spawns, не из данных).
export interface PlacedNpc {
  char: Character;
  x: number;
  y: number;
}

export interface LoadedLocation {
  npcs: PlacedNpc[];                 // NPC этой локации с координатами
  doors: Map<string, Spawn>;         // двери (слой doors, ключ — id соседней локации)
  spawns: Map<string, Spawn>;        // точки появления персонажей (слой spawns, ключ — id персонажа)
  interactions: Map<string, Spawn>;  // интерактивные объекты (слой interactions, напр. "tv")
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

    const empty = () => new Map<string, Spawn>();
    const { doors, spawns, interactions } = cfg.map
      ? this.buildFromMap(cfg.map)
      : { doors: empty(), spawns: empty(), interactions: empty() };

    const npcs: PlacedNpc[] = cfg.isParking
      ? []
      : CHARACTERS.filter((c) => (c.locationIndex ?? 0) === locIndex && c.id !== chosenId)
          .map((char) => ({ char, ...(spawns.get(char.id) ?? { x: 0, y: 0 }) }));
    for (const npc of npcs) this.addNpc(npc);

    return { npcs, doors, spawns, interactions };
  }

  // Из карты Tiled: collision -> стены, doors -> двери (имя = id соседней локации),
  // spawns -> точки персонажей (имя = id персонажа), interactions -> интерактивные объекты.
  private buildFromMap(
    mapKey: string,
  ): { doors: Map<string, Spawn>; spawns: Map<string, Spawn>; interactions: Map<string, Spawn> } {
    const doors = new Map<string, Spawn>();
    const spawns = new Map<string, Spawn>();
    const interactions = new Map<string, Spawn>();
    if (!this.scene.cache.tilemap.exists(mapKey)) return { doors, spawns, interactions };

    const map = this.scene.make.tilemap({ key: mapKey });

    map.getObjectLayer("collision")?.objects.forEach((o) => {
      const w = o.width ?? 0;
      const h = o.height ?? 0;
      const rect = this.scene.add.rectangle((o.x ?? 0) + w / 2, (o.y ?? 0) + h / 2, w, h);
      this.scene.physics.add.existing(rect, true);
      this.walls.add(rect);
    });

    const readPoints = (layer: string, into: Map<string, Spawn>) =>
      map.getObjectLayer(layer)?.objects.forEach((o) => {
        into.set(o.name, { x: o.x ?? 0, y: o.y ?? 0 });
      });

    readPoints("doors", doors);
    readPoints("spawns", spawns);
    readPoints("interactions", interactions);

    return { doors, spawns, interactions };
  }

  private addNpc(npc: PlacedNpc): void {
    const { char, x, y } = npc;
    this.scenery.push(
      this.scene.add
        .image(x, y, char.sprite)
        .setScale(spriteScale(this.scene, char.sprite, this.targetH))
        .setOrigin(0.5, 0.5)
        .setFlipX(!!char.faceRight)
        .setDepth(y),
    );
    this.scenery.push(
      this.scene.add
        .text(x, y - this.targetH * 0.62, char.name, {
          fontFamily: "Trebuchet MS",
          fontSize: "13px",
          color: "#ffffff",
          backgroundColor: "#00000099",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(y),
    );
  }
}
