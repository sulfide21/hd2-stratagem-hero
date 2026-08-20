// Keyboard to direction. Both WASD and the arrow keys, because the real game
// accepts both and muscle memory splits between them.

const KEY_MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};

export function attachInput(handler) {
  function onKeyDown(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

    // Never hijack typing in the high-score name field.
    if (event.target instanceof HTMLInputElement) return;

    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      handler('confirm');
      return;
    }

    const direction = KEY_MAP[event.code];
    if (!direction) return;

    event.preventDefault(); // stop arrow keys scrolling the page
    handler(direction);
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
