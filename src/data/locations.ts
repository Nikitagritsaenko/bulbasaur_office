// Локации игры и связи между ними.
// overlay и map (коллизии) могут отсутствовать — тогда просто не рисуются.
// Геометрия дверей живёт в Tiled, в слое spawns: одна точка на дверь, её имя = id
// соседней локации. Эта точка задаёт и место появления (когда входишь из соседа),
// и зону срабатывания выхода (когда уходишь к соседу). В коде — только топология.

export interface ExitDef {
  to: number; // индекс целевой локации в LOCATIONS
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
    exits: [{ to: LOC.chillZone }, { to: LOC.dataCenter }, { to: LOC.parking }],
  },
  {
    id: "chill-zone",
    name: "Чилл-зона",
    enterLabel: "В чилл-зону",
    bg: "chill-zone-bg",
    overlay: "chill-zone-overlay",
    map: "chill-zone-map",
    exits: [{ to: LOC.mainOffice }],
  },
  {
    id: "vietnam-beach",
    name: "Вьетнамский пляж",
    enterLabel: "На вьетнамский пляж",
    bg: "vietnam-beach-bg",
    overlay: "vietnam-beach-overlay",
    map: "vietnam-beach-map",
    // С пляжа можно вернуться только на парковку.
    exits: [{ to: LOC.parking }],
  },
  {
    id: "data-center",
    name: "Дата-центр",
    enterLabel: "В дата-центр",
    bg: "data-center-bg",
    overlay: "data-center-overlay",
    map: "data-center-map",
    // Единственная дверь дата-центра — внизу. Через неё возвращаемся в офис.
    exits: [{ to: LOC.mainOffice }],
  },
  {
    id: "parking",
    name: "Парковка",
    enterLabel: "На парковку",
    bg: "parking-bg",
    isParking: true,
    // У парковки нет карты — выходы это пункты меню (фаст-тревел), без геометрии.
    exits: [
      { to: LOC.mainOffice },
      { to: LOC.chillZone },
      { to: LOC.vietnamBeach },
      { to: LOC.dataCenter },
    ],
  },
];
