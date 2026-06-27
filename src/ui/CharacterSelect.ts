import type { Character } from "../data/characters";
import { drawContain, getSpriteImage } from "../entities/sprites";

export function showCharacterSelect(
  characters: Character[],
  onPick: (chosen: Character) => void,
): void {
  const select = document.getElementById("select")!;
  const cards = document.getElementById("cards")!;
  cards.innerHTML = "";

  for (const ch of characters) {
    const card = document.createElement("div");
    card.className = "card";

    const cv = document.createElement("canvas");
    cv.width = 84;
    cv.height = 84;
    drawContain(cv.getContext("2d")!, getSpriteImage(ch.sprite), 84);
    card.appendChild(cv);

    card.insertAdjacentHTML(
      "beforeend",
      `<div class="nm">${ch.name}</div><div class="rl">${ch.roleLabel}</div><div class="loc">${ch.areaLabel}</div>`,
    );
    card.onclick = () => {
      select.classList.add("hidden");
      onPick(ch);
    };
    cards.appendChild(card);
  }

  select.classList.remove("hidden");
}
