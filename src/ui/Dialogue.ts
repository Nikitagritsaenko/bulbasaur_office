import type { Character } from "../data/characters";
import type { KeyConsumer } from "./KeyboardRouter";

type Action = "who" | "doing" | "did" | "bye" | "show" | "later";
interface Option {
  label: string;
  action: Action;
}

const MAIN_OPTIONS: Option[] = [
  { label: "Ты кто?", action: "who" },
  { label: "Что тут делаешь?", action: "doing" },
  { label: "Есть апдейты с прошлого демо?", action: "did" },
  { label: "Бывай", action: "bye" },
];

// Появляется после вопроса про демо, когда NPC предлагает показать слайды.
const SLIDE_OPTIONS: Option[] = [
  { label: "Давай", action: "show" },
  { label: "Потом гляну", action: "later" },
];

interface DialogueHandlers {
  onSay: (text: string) => void;            // реплика NPC — печатается в облачке над ним
  onShowSlides: (npc: Character) => void;   // открыть окно слайдов
  onClose: () => void;
}

export class Dialogue implements KeyConsumer {
  isOpen = false;
  paused = false; // true, пока поверх открыто окно слайдов — клавиши меню игнорируются

  private root = document.getElementById("dialogue")!;
  private optionsEl = document.getElementById("dlgOptions")!;

  private options: Option[] = MAIN_OPTIONS;
  private index = 0;
  private npc: Character | null = null;

  constructor(private handlers: DialogueHandlers) {}

  open(npc: Character): void {
    this.npc = npc;
    this.isOpen = true;
    this.setOptions(MAIN_OPTIONS);
    this.root.classList.remove("hidden");
    this.handlers.onSay(npc.lines.greet);
  }

  close(): void {
    this.isOpen = false;
    this.npc = null;
    this.root.classList.add("hidden");
    this.handlers.onClose();
  }

  private setOptions(options: Option[]): void {
    this.options = options;
    this.index = 0;
    this.renderOptions();
  }

  private renderOptions(): void {
    this.optionsEl.innerHTML = "";
    this.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "opt" + (i === this.index ? " sel" : "");
      b.textContent = o.label;
      b.onmouseenter = () => {
        this.index = i;
        this.refreshSel();
      };
      b.onclick = () => this.choose(i);
      this.optionsEl.appendChild(b);
    });
  }

  private refreshSel(): void {
    [...this.optionsEl.children].forEach((el, i) =>
      el.classList.toggle("sel", i === this.index),
    );
  }

  private choose(i: number): void {
    if (!this.npc) return;
    switch (this.options[i].action) {
      case "who":
        this.handlers.onSay(this.npc.lines.who);
        break;
      case "doing":
        this.handlers.onSay(this.npc.lines.doing);
        break;
      case "did":
        this.handlers.onSay(this.npc.lines.did);
        this.setOptions(SLIDE_OPTIONS);
        break;
      case "show":
        this.handlers.onShowSlides(this.npc);
        this.setOptions(MAIN_OPTIONS);
        break;
      case "later":
        this.setOptions(MAIN_OPTIONS);
        break;
      case "bye":
        this.close();
        break;
    }
  }

  isActive(): boolean {
    return this.isOpen && !this.paused;
  }

  handleKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this.index = (this.index + this.options.length - 1) % this.options.length;
        this.refreshSel();
        return true;
      case "ArrowRight":
      case "KeyD":
        this.index = (this.index + 1) % this.options.length;
        this.refreshSel();
        return true;
      case "Enter":
      case "Space":
        this.choose(this.index);
        return true;
      case "Escape":
        this.close();
        return true;
      default:
        return false;
    }
  }
}
