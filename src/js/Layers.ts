import { dom, status } from "./helper";
import Window_Controls from "./Window_Controls";

// One grid cell: a sprite index per layer, null when empty
interface LayerCell {
  l1: number | null; // multicolor layer
  l2: number | null; // detail (hires) layer, drawn on top
}

export interface LayersState {
  width: number;
  height: number;
  show1: boolean;
  show2: boolean;
  cells: LayerCell[];
}

export default class Layers extends Window_Controls {
  private static readonly MAX_GRID = 8;
  private static readonly SEPARATOR_COLOR = "#aaaaaa";
  private static readonly SELECTED_COLOR = "#4488ff";
  private static readonly HOVER_COLOR = "#ffffff";

  canvas_element: HTMLCanvasElement;
  canvas: CanvasRenderingContext2D;
  grid: boolean;
  grid_width = 1;
  grid_height = 1;
  show1 = true;
  show2 = true;
  cells: LayerCell[] = [{ l1: null, l2: null }];
  selected_cell: number | null = null;
  hover_cell: number | null = null;
  all_data: any = null;
  private app: any;

  constructor(public window: number, public config, app: any) {
    super();
    this.config = config;
    this.window = window;
    this.app = app;
    this.grid = this.config.window_layers?.grid ?? true;
    this.zoom = this.config.window_layers?.zoom ?? 6;
    this.zoom_min = this.config.zoom_limits.layers.min;
    this.zoom_max = this.config.zoom_limits.layers.max;
    this.pixels_x = this.config.sprite_x;
    this.pixels_y = this.config.sprite_y;

    this.canvas_element = document.createElement("canvas");
    this.canvas_element.id = "layers";
    this.canvas = this.canvas_element.getContext("2d")!;
    this.resizeCanvas();

    const template = `
      <div class="window_menu">
        <div class="window_menu_icon_area">
          <img src="ui/icon-zoom-in.png" class="icon-hover" id="icon-layers-zoom-in" title="zoom in">
          <img src="ui/icon-zoom-out.png" class="icon-hover" id="icon-layers-zoom-out" title="zoom out">
          <img src="ui/icon-grid.png" class="icon-hover" id="icon-layers-grid" title="toggle grid">
        </div>
        <div class="window_menu_icon_area">
          <label title="grid layout">Layout</label>
          <input type="number" id="layers-grid-width" min="1" max="${Layers.MAX_GRID}" value="1" title="grid width">
          ×
          <input type="number" id="layers-grid-height" min="1" max="${Layers.MAX_GRID}" value="1" title="grid height">
        </div>
        <img src="ui/icon-list-trash.png" class="icon-right icon-hover" id="icon-layers-clear-all" title="clear all cells (visible layers)">
        <img src="ui/icon-erase.png" class="icon-right icon-hover" id="icon-layers-clear" title="clear selected cell (visible layers)">
      </div>
      <div id="layers-canvas-container">
        <div id="layers-canvas"></div>
      </div>
      <div class="window-control-panel">
        <div class="control-row control-row-centered layers-toggles">
          <label><input type="checkbox" id="layers-show-1" checked> Layer 1: multicolor</label>
          <label><input type="checkbox" id="layers-show-2" checked> Layer 2: detail</label>
        </div>
        <div class="control-row control-row-centered layers-hint">Drag sprites from the Sprite List onto a cell</div>
      </div>
    `;

    dom.append("#window-" + this.window, template);
    dom.append_element("#layers-canvas", this.canvas_element);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const widthInput = dom.sel("#layers-grid-width") as HTMLInputElement;
    const heightInput = dom.sel("#layers-grid-height") as HTMLInputElement;
    widthInput.onchange = () => this.resizeGrid(parseInt(widthInput.value) || 1, this.grid_height);
    heightInput.onchange = () => this.resizeGrid(this.grid_width, parseInt(heightInput.value) || 1);

    const show1 = dom.sel("#layers-show-1") as HTMLInputElement;
    const show2 = dom.sel("#layers-show-2") as HTMLInputElement;
    show1.onchange = () => {
      this.show1 = show1.checked;
      this.render();
      this.app.saveState();
    };
    show2.onchange = () => {
      this.show2 = show2.checked;
      this.render();
      this.app.saveState();
    };

    this.canvas_element.addEventListener("mousedown", (e: MouseEvent) => {
      this.selected_cell = this.cellFromPoint(e.clientX, e.clientY);
      this.render();
      this.app.update_ui();
    });

    // Drops from the sprite list; Sortable puts the sprite index in text/plain
    this.canvas_element.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const cell = this.cellFromPoint(e.clientX, e.clientY);
      if (cell !== this.hover_cell) {
        this.hover_cell = cell;
        this.render();
      }
    });
    this.canvas_element.addEventListener("dragleave", () => {
      this.hover_cell = null;
      this.render();
    });
    this.canvas_element.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      const cell = this.cellFromPoint(e.clientX, e.clientY);
      const index = parseInt(e.dataTransfer?.getData("text/plain") ?? "");
      this.hover_cell = null;
      if (cell !== null) this.placeSprite(cell, index);
      this.render();
    });
  }

  // Multicolor sprites always go to layer 1, single color ones to layer 2
  placeSprite(cell: number, spriteIndex: number): void {
    const sprite = this.all_data?.sprites[spriteIndex];
    if (!sprite) return;
    const layer = sprite.multicolor ? 1 : 2;
    if (layer === 1) this.cells[cell].l1 = spriteIndex;
    else this.cells[cell].l2 = spriteIndex;
    this.selected_cell = cell;
    const visible = layer === 1 ? this.show1 : this.show2;
    status(`"${sprite.name}" placed on layer ${layer}${visible ? "" : " (hidden)"}`);
    this.app.update_ui();
    this.app.saveState();
  }

  resizeGrid(width: number, height: number): void {
    const w = Math.max(1, Math.min(Layers.MAX_GRID, width));
    const h = Math.max(1, Math.min(Layers.MAX_GRID, height));
    const cells: LayerCell[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const old = x < this.grid_width && y < this.grid_height ? this.cells[y * this.grid_width + x] : null;
        cells.push(old ? { ...old } : { l1: null, l2: null });
      }
    }
    this.grid_width = w;
    this.grid_height = h;
    this.cells = cells;
    this.selected_cell = null;
    this.hover_cell = null;
    this.syncControls();
    this.resizeCanvas();
    this.render();
    this.app.update_ui();
    this.app.saveState();
  }

  clearSelectedCell(): void {
    if (this.selected_cell === null) return;
    this.clearCell(this.cells[this.selected_cell]);
    this.render();
    this.app.saveState();
  }

  clearAll(): void {
    this.cells.forEach((c) => this.clearCell(c));
    this.render();
    this.app.saveState();
  }

  // Only touches the layers that are currently shown
  private clearCell(cell: LayerCell): void {
    if (this.show1) cell.l1 = null;
    if (this.show2) cell.l2 = null;
  }

  hasCellSelected(): boolean {
    return this.selected_cell !== null;
  }

  private cellFromPoint(clientX: number, clientY: number): number | null {
    const rect = this.canvas_element.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * this.grid_width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.grid_height);
    if (x < 0 || y < 0 || x >= this.grid_width || y >= this.grid_height) return null;
    return y * this.grid_width + x;
  }

  private syncControls(): void {
    dom.val("#layers-grid-width", String(this.grid_width));
    dom.val("#layers-grid-height", String(this.grid_height));
    (dom.sel("#layers-show-1") as HTMLInputElement).checked = this.show1;
    (dom.sel("#layers-show-2") as HTMLInputElement).checked = this.show2;
  }

  private resizeCanvas(): void {
    this.width = this.pixels_x * this.grid_width * this.zoom;
    this.height = this.pixels_y * this.grid_height * this.zoom;
    this.canvas_element.width = this.width;
    this.canvas_element.height = this.height;
  }

  update_zoom(): void {
    this.resizeCanvas();
    this.render();
  }

  toggle_grid(): void {
    this.grid = !this.grid;
    this.render();
  }

  get_grid(): boolean {
    return this.grid;
  }

  update(all_data: any): void {
    this.all_data = all_data;
    this.render();
  }

  getState(): LayersState {
    return {
      width: this.grid_width,
      height: this.grid_height,
      show1: this.show1,
      show2: this.show2,
      cells: this.cells.map((c) => ({ l1: c.l1, l2: c.l2 })),
    };
  }

  setState(state: LayersState | null | undefined): void {
    if (!state) return;
    this.grid_width = Math.max(1, Math.min(Layers.MAX_GRID, state.width ?? 1));
    this.grid_height = Math.max(1, Math.min(Layers.MAX_GRID, state.height ?? 1));
    this.cells = Array.from({ length: this.grid_width * this.grid_height }, (_, i) => ({
      l1: state.cells?.[i]?.l1 ?? null,
      l2: state.cells?.[i]?.l2 ?? null,
    }));
    this.show1 = state.show1 ?? true;
    this.show2 = state.show2 ?? true;
    this.selected_cell = null;
    this.hover_cell = null;
    this.syncControls();
    this.resizeCanvas();
    this.render();
  }

  render(): void {
    if (!this.all_data) return;

    this.canvas.fillStyle = this.config.colors[this.all_data.colors[0]];
    this.canvas.fillRect(0, 0, this.width, this.height);

    // layer 1 underneath, layer 2 (detail) on top
    if (this.show1) this.cells.forEach((c, i) => this.renderSpriteInCell(c.l1, i));
    if (this.show2) this.cells.forEach((c, i) => this.renderSpriteInCell(c.l2, i));

    if (this.grid) this.drawSeparators();
    if (this.selected_cell !== null) this.outlineCell(this.selected_cell, Layers.SELECTED_COLOR);
    if (this.hover_cell !== null) this.outlineCell(this.hover_cell, Layers.HOVER_COLOR);
  }

  // Expanded sprites keep their size and spill into the neighbouring cells
  private renderSpriteInCell(spriteIndex: number | null, cell: number): void {
    if (spriteIndex === null) return;
    const sprite = this.all_data.sprites[spriteIndex];
    if (!sprite) return; // sprite was deleted from the list
    const origin_x = (cell % this.grid_width) * this.pixels_x;
    const origin_y = Math.floor(cell / this.grid_width) * this.pixels_y;
    const step = sprite.multicolor ? 2 : 1;
    const scale_x = sprite.double_x ? 2 : 1;
    const scale_y = sprite.double_y ? 2 : 1;

    for (let i = 0; i < this.pixels_x; i += step) {
      for (let j = 0; j < this.pixels_y; j++) {
        const entry = sprite.pixels[j][i];
        if (entry === 0) continue;
        const color = entry === 1 || !sprite.multicolor ? sprite.color : this.all_data.colors[entry];
        this.canvas.fillStyle = this.config.colors[color];
        this.canvas.fillRect(
          (origin_x + i * scale_x) * this.zoom,
          (origin_y + j * scale_y) * this.zoom,
          step * scale_x * this.zoom,
          scale_y * this.zoom
        );
      }
    }
  }

  private drawSeparators(): void {
    this.canvas.save();
    this.canvas.strokeStyle = Layers.SEPARATOR_COLOR;
    this.canvas.lineWidth = 1;
    this.canvas.setLineDash([2, 2]);
    for (let x = 1; x < this.grid_width; x++) {
      const px = x * this.pixels_x * this.zoom + 0.5;
      this.canvas.beginPath();
      this.canvas.moveTo(px, 0);
      this.canvas.lineTo(px, this.height);
      this.canvas.stroke();
    }
    for (let y = 1; y < this.grid_height; y++) {
      const py = y * this.pixels_y * this.zoom + 0.5;
      this.canvas.beginPath();
      this.canvas.moveTo(0, py);
      this.canvas.lineTo(this.width, py);
      this.canvas.stroke();
    }
    this.canvas.restore();
  }

  private outlineCell(cell: number, color: string): void {
    const x = (cell % this.grid_width) * this.pixels_x * this.zoom;
    const y = Math.floor(cell / this.grid_width) * this.pixels_y * this.zoom;
    this.canvas.save();
    this.canvas.strokeStyle = color;
    this.canvas.lineWidth = 2;
    this.canvas.setLineDash([3, 3]);
    this.canvas.strokeRect(x + 1, y + 1, this.pixels_x * this.zoom - 2, this.pixels_y * this.zoom - 2);
    this.canvas.restore();
  }
}
