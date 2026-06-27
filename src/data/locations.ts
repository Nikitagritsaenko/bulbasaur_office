// Локации игры и связи между ними.
// overlay и map (коллизии) могут отсутствовать — тогда просто не рисуются.
// Зоны выходов (zone) — заготовки, их подгоняют под двери на картинках.
// Точка появления (spawn) — имя объекта в слое spawns карты целевой локации.

export interface ExitDef {
  to: number;                                            // индекс целевой локации в LOCATIONS
  zone: { x: number; y: number; w: number; h: number };  // зона у двери (для парковки игнорируется)
  spawn: string;                                         // имя точки в слое spawns целевой локации
}

export interface LocationDef {
  id: string;
  name: string;        // человекочитаемое имя
  enterLabel: string;  // надпись на кнопке перехода СЮДА: «В чилл-зону», «На парковку»
  bg: string;          // ключ текстуры фона
  overlay?: string;    // ключ текстуры overlay (верх двери); может не существовать
  map?: string;        // ключ карты Tiled с коллизиями; может не существовать
  isParking?: boolean; // на парковке нельзя ходить — показывается меню выбора локации
  exits: ExitDef[];    // двери/переходы наружу (для парковки — пункты меню)
}

export const LOC = {
  mainOffice: 0,
  chillZone: 1,
  vietnamBeach: 2,
  dataCenter: 3,
  parking: 4,
} as const;

export const LOCATIONS: LocationDef[] = [
  {
    id: "main-office",
    name: "Главный офис",
    enterLabel: "В главный офис",
    bg: "main-office-bg",
    overlay: "main-office-overlay",
    map: "main-office-map",
    exits: [
      // Дверь в чилл-зону — вдоль верхней стены комнаты с ноутбуками.
      { to: LOC.chillZone, zone: { x: 300, y: 28, w: 88, h: 56 }, spawn: "entry" },
      // Дверь в дата-центр — вдоль левой стены комнаты с ноутбуками (двери на картинке пока нет).
      { to: LOC.dataCenter, zone: { x: 28, y: 150, w: 56, h: 96 }, spawn: "entry" },
      // Выход на парковку — внизу карты (на парковке ходить нельзя, точка не нужна).
      { to: LOC.parking, zone: { x: 588, y: 704, w: 88, h: 64 }, spawn: "" },
    ],
  },
  {
    id: "chill-zone",
    name: "Чилл-зона",
    enterLabel: "В чилл-зону",
    bg: "chill-zone-bg",
    overlay: "chill-zone-overlay",
    map: "chill-zone-map",
    exits: [
      // Назад в главный офис — игрок появляется у верхней стены комнаты с ноутбуками.
      { to: LOC.mainOffice, zone: { x: 660, y: 704, w: 88, h: 64 }, spawn: "chillDoor" },
    ],
  },
  {
    id: "vietnam-beach",
    name: "Вьетнамский пляж",
    enterLabel: "На вьетнамский пляж",
    bg: "vietnam-beach-bg",
    overlay: "vietnam-beach-overlay",
    map: "vietnam-beach-map",
    exits: [
      // С пляжа можно вернуться только на парковку.
      { to: LOC.parking, zone: { x: 660, y: 704, w: 88, h: 64 }, spawn: "" },
    ],
  },
  {
    id: "data-center",
    name: "Дата-центр",
    enterLabel: "В дата-центр",
    bg: "data-center-bg",
    overlay: "data-center-overlay",
    map: "data-center-map",
    exits: [
      // Единственная дверь дата-центра — внизу. Через неё возвращаемся в офис,
      // где появляемся у левой стены комнаты с ноутбуками.
      { to: LOC.mainOffice, zone: { x: 196, y: 700, w: 104, h: 64 }, spawn: "dataDoor" },
    ],
  },
  {
    id: "parking",
    name: "Парковка",
    enterLabel: "На парковку",
    bg: "parking-bg",
    isParking: true,
    // Для парковки zone не используется — это пункты меню. spawn — имя точки в целевой локации.
    exits: [
      { to: LOC.mainOffice, zone: { x: 0, y: 0, w: 0, h: 0 }, spawn: "parkingDoor" },
      { to: LOC.chillZone, zone: { x: 0, y: 0, w: 0, h: 0 }, spawn: "entry" },
      { to: LOC.vietnamBeach, zone: { x: 0, y: 0, w: 0, h: 0 }, spawn: "entry" },
      { to: LOC.dataCenter, zone: { x: 0, y: 0, w: 0, h: 0 }, spawn: "entry" },
    ],
  },
];
