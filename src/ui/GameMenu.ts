import type { KeyConsumer } from "./KeyboardRouter";

interface GameOption {
  label: string;
  id: string;
}

// Список доступных игр.
const GAMES: GameOption[] = [
  { label: "Bulba Jump", id: "bulbajump" },
  { label: "Bulba Packer", id: "bulbapacker" },
  { label: "Bulba Parking", id: "bulbaparking" },
  { label: "Bulba Racing", id: "bulbaracing" },
];

// Меню выбора игры у телевизора: ряд «таблеток» внизу, как меню вопросов диалога.
export class GameMenu implements KeyConsumer {
  isOpen = false;

  private root = document.getElementById("gameMenu")!;
  private optionsEl = document.getElementById("gameMenuOptions")!;
  private index = 0;

  constructor(private onPick: (gameId: string) => void) {}

  open(): void {
    this.isOpen = true;
    this.index = 0;
    this.render();
    this.root.classList.remove("hidden");
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.add("hidden");
  }

  private render(): void {
    this.optionsEl.innerHTML = "";
    GAMES.forEach((g, i) => {
      const b = document.createElement("button");
      b.className = "opt" + (i === this.index ? " sel" : "");
      b.textContent = g.label;
      b.onmouseenter = () => {
        this.index = i;
        this.refreshSel();
      };
      b.onclick = () => this.onPick(g.id);
      this.optionsEl.appendChild(b);
    });
  }

  private refreshSel(): void {
    [...this.optionsEl.children].forEach((el, i) => el.classList.toggle("sel", i === this.index));
  }

  isActive(): boolean {
    return this.isOpen;
  }

  handleKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this.index = (this.index + GAMES.length - 1) % GAMES.length;
        this.refreshSel();
        return true;
      case "ArrowRight":
      case "KeyD":
        this.index = (this.index + 1) % GAMES.length;
        this.refreshSel();
        return true;
      case "Enter":
      case "Space":
        this.onPick(GAMES[this.index].id);
        return true;
      case "Escape":
        this.close();
        return true;
      default:
        return false;
    }
  }
}
