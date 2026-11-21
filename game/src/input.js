// Keyboard and mouse input. The game reads a plain state object each
// tick; the headless simulator builds the same shape by hand.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered keys, cleared each tick
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.canvas = canvas;
    this.onKey = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.pressed.add(k);
      this.keys.add(k);
    };
    this.onKeyUp = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    };
    this.onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    };
    this.onMouseDown = (e) => {
      this.onMouseMove(e);
      this.mouseDown = true;
      this.mousePressed = true;
    };
    this.onMouseUp = () => { this.mouseDown = false; };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
  }
  down(k) { return this.keys.has(k); }
  wasPressed(k) { return this.pressed.has(k); }
  // Movement vector from WASD / arrows, normalized.
  moveVector() {
    let x = 0; let y = 0;
    if (this.down('a') || this.down('ArrowLeft')) x -= 1;
    if (this.down('d') || this.down('ArrowRight')) x += 1;
    if (this.down('w') || this.down('ArrowUp')) y -= 1;
    if (this.down('s') || this.down('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) { x *= 0.7071; y *= 0.7071; }
    return { x, y };
  }
  endTick() {
    this.pressed.clear();
    this.mousePressed = false;
  }
}

// A headless stand-in with the same shape, driven by the simulator.
export function blankInput() {
  return {
    keys: new Set(),
    down(k) { return this.keys.has(k); },
    wasPressed() { return false; },
    moveVector() { return { x: 0, y: 0 }; },
    mouseX: 0, mouseY: 0, mouseDown: false, mousePressed: false,
    endTick() {},
  };
}
