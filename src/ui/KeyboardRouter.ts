// Единая точка обработки клавиатуры. Заменяет россыпь window.addEventListener
// в Dialogue/LocationMenu/SlideViewer: один слушатель раздаёт keydown активным
// потребителям по приоритету (чем раньше зарегистрирован — тем выше).
export interface KeyConsumer {
  isActive(): boolean;
  // true, если событие обработано — тогда оно не идёт ниже по списку.
  handleKey(e: KeyboardEvent): boolean;
}

export class KeyboardRouter {
  private consumers: KeyConsumer[] = [];

  constructor() {
    window.addEventListener("keydown", (e) => this.dispatch(e));
  }

  register(consumer: KeyConsumer): void {
    this.consumers.push(consumer);
  }

  private dispatch(e: KeyboardEvent): void {
    for (const c of this.consumers) {
      if (c.isActive() && c.handleKey(e)) {
        e.preventDefault();
        return;
      }
    }
  }
}
