/**
 * Editor de niveles (GDD §13) — ruta #/editor.
 *
 * Lienzo 2D en SVG (funciona táctil y con ratón vía PointerEvents; mucho más
 * simple y fluido que montar un canvas R3F para una vista cenital plana):
 * rejilla 1×1, colocación con snap de 0.5 u, arrastre para mover, selección
 * con panel de propiedades, huecos de puerta y validaciones en vivo con el
 * MISMO parser (room-format.ts) que usan el juego y el generador.
 *
 * Persistencia: borrador autoguardado en localStorage; exportar descarga el
 * .json, lo copia al portapapeles y lo añade al pool local del generador;
 * en dev, "Guardar en src/levels" hace POST /api/editor/rooms (middleware de
 * Vite) y escribe el fichero en el repo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DOOR_WIDTH, ROOM_MIN_SIZE, WALL_THICKNESS } from '../game/content/constants';
import { parseRoomData, parseRoomDataFromJson } from '../game/sim/room-format';
import type {
  DoorSide,
  EnemyKind,
  EnemySpawn,
  HazardKind,
  HazardSpawn,
  ItemKind,
  RoomData,
  RoomTag,
  Vec2,
} from '../game/sim/world';
import { addExportedRoom, loadDraft, saveDraft, savePlaytestRoom } from './editor-storage';

// ── Modelo del editor ──────────────────────────────────────────────────────

type Selection =
  | { type: 'enemy'; id: string }
  | { type: 'hazard'; id: string }
  | { type: 'item'; id: string }
  | { type: 'start' }
  | null;

type PlaceKind =
  | { type: 'enemy'; kind: EnemyKind }
  | { type: 'hazard'; kind: HazardKind }
  | { type: 'item'; kind: ItemKind }
  | { type: 'start' }
  | null;

const ENEMY_KINDS: EnemyKind[] = ['dummy', 'chaser', 'spike', 'trail', 'shooter'];
const HAZARD_KINDS: HazardKind[] = ['pit', 'spikes', 'barrel', 'rock', 'slow', 'boost'];
const ITEM_KINDS: ItemKind[] = ['coin', 'potion', 'key'];
const ALL_TAGS: RoomTag[] = ['inicio', 'combate', 'llave', 'recompensa', 'jefe'];
const SIDES: DoorSide[] = ['north', 'south', 'east', 'west'];

const ENEMY_COLOR: Record<EnemyKind, string> = {
  dummy: '#ff5964',
  chaser: '#ff9f45',
  spike: '#9aa1bd',
  trail: '#4dd68a',
  shooter: '#2b2f42',
};
const HAZARD_COLOR: Record<HazardKind, string> = {
  pit: '#05060a',
  spikes: '#8d94ad',
  barrel: '#c0442b',
  rock: '#767d99',
  slow: '#6b4a2f',
  boost: '#3fd0ff',
};
const ITEM_COLOR: Record<ItemKind, string> = { coin: '#ffd166', potion: '#ff6bcb', key: '#ffe082' };
const SIDE_LABEL: Record<DoorSide, string> = { north: 'Norte', south: 'Sur', east: 'Este', west: 'Oeste' };

function defaultRoom(): RoomData {
  return {
    version: 1,
    id: 'mi-sala',
    name: 'Mi Sala',
    width: 9,
    height: 9,
    playerStart: { x: 0, y: 3 },
    tags: ['combate'],
    doorSlots: [
      { side: 'north', offset: 0 },
      { side: 'south', offset: 0 },
      { side: 'east', offset: 0 },
      { side: 'west', offset: 0 },
    ],
    enemies: [],
    hazards: [],
    items: [],
  };
}

function snap(v: number): number {
  return Math.round(v * 2) / 2;
}

function nextId(prefix: string, existing: { id: string }[]): string {
  let n = 1;
  const ids = new Set(existing.map((e) => e.id));
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

const HAZARD_DEFAULT_SIZE: Record<HazardKind, { width: number; height: number }> = {
  pit: { width: 1.6, height: 1.6 },
  spikes: { width: 1.4, height: 1.4 },
  barrel: { width: 0.8, height: 0.8 },
  rock: { width: 1.2, height: 1.2 },
  slow: { width: 2, height: 1.6 },
  boost: { width: 1.2, height: 2 },
};

// ── Validaciones en vivo (GDD §13): parser común + reglas propias del editor ──

function validateLive(room: RoomData): string[] {
  const result = parseRoomData(room);
  const errors = [...result.errors];
  const halfW = room.width / 2;
  const halfH = room.height / 2;

  const inside = (p: Vec2) => p.x >= -halfW && p.x <= halfW && p.y >= -halfH && p.y <= halfH;
  if (!inside(room.playerStart)) errors.push('El inicio del jugador está fuera de la sala.');
  for (const e of room.enemies) {
    if (!inside(e.position)) errors.push(`El enemigo "${e.id}" está fuera de la sala.`);
    if (e.patrolTarget && !inside(e.patrolTarget)) {
      errors.push(`El destino de patrulla de "${e.id}" está fuera de la sala.`);
    }
  }
  for (const h of room.hazards) {
    if (!inside(h.position)) errors.push(`El hazard "${h.id}" está fuera de la sala.`);
  }
  for (const i of room.items) {
    if (!inside(i.position)) errors.push(`El objeto "${i.id}" está fuera de la sala.`);
  }
  for (const slot of room.doorSlots) {
    const axisHalf = (slot.side === 'north' || slot.side === 'south' ? room.width : room.height) / 2;
    if (Math.abs(slot.offset) + DOOR_WIDTH / 2 > axisHalf) {
      errors.push(`El hueco de puerta ${SIDE_LABEL[slot.side]} (${slot.offset}) se sale del muro.`);
    }
  }
  return errors;
}

// ── Página ─────────────────────────────────────────────────────────────────

export function EditorPage() {
  const [room, setRoom] = useState<RoomData>(() => loadDraft() ?? defaultRoom());
  const [selection, setSelection] = useState<Selection>(null);
  const [placing, setPlacing] = useState<PlaceKind>(null);
  const [status, setStatus] = useState<string>('');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ selection: Selection; moved: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autoguardado del borrador (GDD §13: no perder trabajo al cerrar).
  useEffect(() => {
    saveDraft(room);
  }, [room]);

  const errors = useMemo(() => validateLive(room), [room]);

  const showStatus = useCallback((text: string) => {
    setStatus(text);
    window.setTimeout(() => setStatus(''), 2500);
  }, []);

  // Conversión de coordenadas de puntero → coordenadas de sala (u de mundo).
  const pointerToWorld = useCallback((e: { clientX: number; clientY: number }): Vec2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const margin = 1.5;
    const viewW = room.width + margin * 2;
    const viewH = room.height + margin * 2;
    // El SVG usa preserveAspectRatio="xMidYMid meet": misma escala en ambos ejes.
    const scale = Math.min(rect.width / viewW, rect.height / viewH);
    const offsetX = (rect.width - viewW * scale) / 2;
    const offsetY = (rect.height - viewH * scale) / 2;
    const x = (e.clientX - rect.left - offsetX) / scale - viewW / 2;
    const y = (e.clientY - rect.top - offsetY) / scale - viewH / 2;
    return { x, y };
  }, [room.width, room.height]);

  // ── Mutaciones ──

  const placeAt = useCallback(
    (pos: Vec2) => {
      if (!placing) return;
      const p = { x: snap(pos.x), y: snap(pos.y) };
      if (placing.type === 'start') {
        setRoom((r) => ({ ...r, playerStart: p }));
        setSelection({ type: 'start' });
      } else if (placing.type === 'enemy') {
        setRoom((r) => {
          const id = nextId(placing.kind, r.enemies);
          setSelection({ type: 'enemy', id });
          return { ...r, enemies: [...r.enemies, { id, kind: placing.kind, position: p }] };
        });
      } else if (placing.type === 'hazard') {
        setRoom((r) => {
          const id = nextId(placing.kind, r.hazards);
          setSelection({ type: 'hazard', id });
          const size = HAZARD_DEFAULT_SIZE[placing.kind];
          const hazard: HazardSpawn = { id, kind: placing.kind, position: p, ...size };
          if (placing.kind === 'boost') hazard.direction = { x: 0, y: -1 };
          return { ...r, hazards: [...r.hazards, hazard] };
        });
      } else {
        setRoom((r) => {
          const id = nextId(placing.kind, r.items);
          setSelection({ type: 'item', id });
          return { ...r, items: [...r.items, { id, kind: placing.kind, position: p }] };
        });
      }
      setPlacing(null);
    },
    [placing],
  );

  const moveSelected = useCallback((sel: Selection, pos: Vec2) => {
    if (!sel) return;
    const p = { x: snap(pos.x), y: snap(pos.y) };
    setRoom((r) => {
      switch (sel.type) {
        case 'start':
          return { ...r, playerStart: p };
        case 'enemy':
          return { ...r, enemies: r.enemies.map((e) => (e.id === sel.id ? { ...e, position: p } : e)) };
        case 'hazard':
          return { ...r, hazards: r.hazards.map((h) => (h.id === sel.id ? { ...h, position: p } : h)) };
        case 'item':
          return { ...r, items: r.items.map((i) => (i.id === sel.id ? { ...i, position: p } : i)) };
      }
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selection || selection.type === 'start') return;
    setRoom((r) => {
      switch (selection.type) {
        case 'enemy':
          return { ...r, enemies: r.enemies.filter((e) => e.id !== selection.id) };
        case 'hazard':
          return { ...r, hazards: r.hazards.filter((h) => h.id !== selection.id) };
        case 'item':
          return { ...r, items: r.items.filter((i) => i.id !== selection.id) };
        default:
          return r;
      }
    });
    setSelection(null);
  }, [selection]);

  const duplicateSelected = useCallback(() => {
    if (!selection || selection.type === 'start') return;
    setRoom((r) => {
      const shift = (p: Vec2): Vec2 => ({ x: snap(p.x + 1), y: snap(p.y + 1) });
      switch (selection.type) {
        case 'enemy': {
          const src = r.enemies.find((e) => e.id === selection.id);
          if (!src) return r;
          const id = nextId(src.kind, r.enemies);
          setSelection({ type: 'enemy', id });
          return { ...r, enemies: [...r.enemies, { ...src, id, position: shift(src.position) }] };
        }
        case 'hazard': {
          const src = r.hazards.find((h) => h.id === selection.id);
          if (!src) return r;
          const id = nextId(src.kind, r.hazards);
          setSelection({ type: 'hazard', id });
          return { ...r, hazards: [...r.hazards, { ...src, id, position: shift(src.position) }] };
        }
        case 'item': {
          const src = r.items.find((i) => i.id === selection.id);
          if (!src) return r;
          const id = nextId(src.kind, r.items);
          setSelection({ type: 'item', id });
          return { ...r, items: [...r.items, { ...src, id, position: shift(src.position) }] };
        }
        default:
          return r;
      }
    });
  }, [selection]);

  // ── Puntero sobre el lienzo ──

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pos = pointerToWorld(e);
      if (!pos) return;
      if (placing) {
        placeAt(pos);
        return;
      }
      // Sin modo de colocación: clic en vacío deselecciona (la selección de
      // entidades se hace en los onPointerDown de cada figura, que hacen
      // stopPropagation).
      setSelection(null);
    },
    [placing, placeAt, pointerToWorld],
  );

  const beginDrag = useCallback(
    (e: React.PointerEvent, sel: Selection) => {
      e.stopPropagation();
      setSelection(sel);
      dragRef.current = { selection: sel, moved: false };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag || !drag.selection) return;
      const pos = pointerToWorld(e);
      if (!pos) return;
      drag.moved = true;
      moveSelected(drag.selection, pos);
    },
    [moveSelected, pointerToWorld],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ── Acciones de fichero ──

  const exportRoom = useCallback(async () => {
    const result = parseRoomData(room);
    if (!result.valid || !result.room) {
      showStatus('La sala tiene errores: corrígelos antes de exportar.');
      return;
    }
    const json = JSON.stringify(result.room, null, 2);
    // Descarga.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.room.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // Portapapeles (best-effort) + pool local del generador.
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // Sin permiso de portapapeles: la descarga ya cubre el export.
    }
    addExportedRoom(result.room);
    showStatus('Exportada: descargada, copiada y añadida al pool.');
  }, [room, showStatus]);

  const importRoom = useCallback(
    (file: File) => {
      void file.text().then((text) => {
        const result = parseRoomDataFromJson(text);
        if (!result.valid || !result.room) {
          showStatus(`Import inválido: ${result.errors[0] ?? 'formato desconocido'}`);
          return;
        }
        setRoom(result.room);
        setSelection(null);
        showStatus(`Importada "${result.room.name}".`);
      });
    },
    [showStatus],
  );

  const saveToDevServer = useCallback(async () => {
    const result = parseRoomData(room);
    if (!result.valid || !result.room) {
      showStatus('La sala tiene errores: corrígelos antes de guardar.');
      return;
    }
    try {
      const response = await fetch('/api/editor/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.room),
      });
      showStatus(response.ok ? `Guardada en src/levels/${result.room.id}.json` : 'Error del servidor al guardar.');
    } catch {
      showStatus('No se pudo contactar con el dev server.');
    }
  }, [room, showStatus]);

  const playtest = useCallback(() => {
    if (errors.length > 0) {
      showStatus('La sala tiene errores: corrígelos antes de probar.');
      return;
    }
    if (savePlaytestRoom(room)) {
      window.location.hash = '#/playtest';
    } else {
      showStatus('No se pudo preparar el playtest.');
    }
  }, [room, errors, showStatus]);

  // ── Derivados de render ──

  const halfW = room.width / 2;
  const halfH = room.height / 2;
  const margin = 1.5;
  const t = WALL_THICKNESS;
  const selectedEnemy = selection?.type === 'enemy' ? room.enemies.find((e) => e.id === selection.id) : undefined;
  const selectedHazard = selection?.type === 'hazard' ? room.hazards.find((h) => h.id === selection.id) : undefined;
  const selectedItem = selection?.type === 'item' ? room.items.find((i) => i.id === selection.id) : undefined;

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let x = Math.ceil(-halfW); x <= Math.floor(halfW); x++) {
      lines.push({ x1: x, y1: -halfH, x2: x, y2: halfH });
    }
    for (let y = Math.ceil(-halfH); y <= Math.floor(halfH); y++) {
      lines.push({ x1: -halfW, y1: y, x2: halfW, y2: y });
    }
    return lines;
  }, [halfW, halfH]);

  return (
    <div className="editor-root">
      <header className="editor-header">
        <a href="#/" className="editor-back">
          ← Juego
        </a>
        <h1 className="editor-title">Editor de niveles</h1>
        <div className="editor-header-actions">
          <button type="button" className="editor-btn editor-btn-primary" onClick={playtest}>
            ▶ Probar
          </button>
        </div>
      </header>

      <div className="editor-body">
        {/* ── Lienzo ── */}
        <div className="editor-canvas-wrap">
          <svg
            ref={svgRef}
            className="editor-canvas"
            viewBox={`${-halfW - margin} ${-halfH - margin} ${room.width + margin * 2} ${room.height + margin * 2}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* Muros */}
            <rect
              x={-halfW - t}
              y={-halfH - t}
              width={room.width + 2 * t}
              height={room.height + 2 * t}
              fill="#3b4266"
            />
            {/* Suelo */}
            <rect x={-halfW} y={-halfH} width={room.width} height={room.height} fill="#20243a" />
            {/* Rejilla 1×1 */}
            {gridLines.map((l, i) => (
              <line key={i} {...l} stroke="#2c3150" strokeWidth={0.03} />
            ))}
            {/* Huecos de puerta */}
            {room.doorSlots.map((slot, i) => {
              const w = DOOR_WIDTH;
              const isH = slot.side === 'north' || slot.side === 'south';
              const x = isH ? slot.offset - w / 2 : slot.side === 'east' ? halfW : -halfW - t;
              const y = !isH ? slot.offset - w / 2 : slot.side === 'south' ? halfH : -halfH - t;
              return (
                <rect
                  key={`door-${i}`}
                  x={x}
                  y={y}
                  width={isH ? w : t}
                  height={isH ? t : w}
                  fill="#5a6db3"
                />
              );
            })}
            {/* Hazards (rectángulos) */}
            {room.hazards.map((h) => (
              <g key={h.id} onPointerDown={(e) => beginDrag(e, { type: 'hazard', id: h.id })}>
                <rect
                  x={h.position.x - h.width / 2}
                  y={h.position.y - h.height / 2}
                  width={h.width}
                  height={h.height}
                  fill={HAZARD_COLOR[h.kind]}
                  stroke={selection?.type === 'hazard' && selection.id === h.id ? '#54c7ff' : 'none'}
                  strokeWidth={0.08}
                />
                {h.kind === 'boost' && h.direction && (
                  <line
                    x1={h.position.x}
                    y1={h.position.y}
                    x2={h.position.x + h.direction.x * 0.7}
                    y2={h.position.y + h.direction.y * 0.7}
                    stroke="#e8f6ff"
                    strokeWidth={0.1}
                  />
                )}
              </g>
            ))}
            {/* Items */}
            {room.items.map((i) => (
              <circle
                key={i.id}
                cx={i.position.x}
                cy={i.position.y}
                r={0.28}
                fill={ITEM_COLOR[i.kind]}
                stroke={selection?.type === 'item' && selection.id === i.id ? '#54c7ff' : '#0b0d14'}
                strokeWidth={0.07}
                onPointerDown={(e) => beginDrag(e, { type: 'item', id: i.id })}
              />
            ))}
            {/* Enemigos */}
            {room.enemies.map((en) => (
              <g key={en.id} onPointerDown={(e) => beginDrag(e, { type: 'enemy', id: en.id })}>
                {en.patrolTarget && (
                  <line
                    x1={en.position.x}
                    y1={en.position.y}
                    x2={en.patrolTarget.x}
                    y2={en.patrolTarget.y}
                    stroke="#aab2d4"
                    strokeWidth={0.05}
                    strokeDasharray="0.2 0.15"
                  />
                )}
                <circle
                  cx={en.position.x}
                  cy={en.position.y}
                  r={en.radius ?? 0.4}
                  fill={ENEMY_COLOR[en.kind]}
                  stroke={selection?.type === 'enemy' && selection.id === en.id ? '#54c7ff' : '#0b0d14'}
                  strokeWidth={0.07}
                />
                {en.kind === 'spike' && (
                  <line
                    x1={en.position.x}
                    y1={en.position.y}
                    x2={en.position.x + (en.facing?.x ?? 0) * 0.7}
                    y2={en.position.y + (en.facing?.y ?? 1) * 0.7}
                    stroke="#e2e6f2"
                    strokeWidth={0.12}
                  />
                )}
              </g>
            ))}
            {/* Inicio del jugador */}
            <circle
              cx={room.playerStart.x}
              cy={room.playerStart.y}
              r={0.38}
              fill="#54c7ff"
              stroke={selection?.type === 'start' ? '#ffffff' : '#0b0d14'}
              strokeWidth={0.08}
              onPointerDown={(e) => beginDrag(e, { type: 'start' })}
            />
          </svg>
          {placing && (
            <div className="editor-placing-hint">
              Toca el lienzo para colocar · <button type="button" onClick={() => setPlacing(null)}>cancelar</button>
            </div>
          )}
          {status && <div className="editor-status">{status}</div>}
        </div>

        {/* ── Panel lateral ── */}
        <aside className="editor-panel">
          <section className="editor-section">
            <h2>Sala</h2>
            <label className="editor-field">
              <span>Identificador</span>
              <input
                value={room.id}
                onChange={(e) => setRoom({ ...room, id: e.target.value.trim() })}
              />
            </label>
            <label className="editor-field">
              <span>Nombre</span>
              <input value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} />
            </label>
            <div className="editor-field-row">
              <label className="editor-field">
                <span>Ancho (impar ≥ {ROOM_MIN_SIZE})</span>
                <input
                  type="number"
                  min={ROOM_MIN_SIZE}
                  step={2}
                  value={room.width}
                  onChange={(e) => setRoom({ ...room, width: Number(e.target.value) })}
                />
              </label>
              <label className="editor-field">
                <span>Alto (impar ≥ {ROOM_MIN_SIZE})</span>
                <input
                  type="number"
                  min={ROOM_MIN_SIZE}
                  step={2}
                  value={room.height}
                  onChange={(e) => setRoom({ ...room, height: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="editor-tags">
              {ALL_TAGS.map((tag) => (
                <label key={tag} className="editor-tag">
                  <input
                    type="checkbox"
                    checked={room.tags.includes(tag)}
                    onChange={(e) =>
                      setRoom({
                        ...room,
                        tags: e.target.checked ? [...room.tags, tag] : room.tags.filter((x) => x !== tag),
                      })
                    }
                  />
                  {tag}
                </label>
              ))}
            </div>
          </section>

          <section className="editor-section">
            <h2>Puertas (máx. 2 por lado)</h2>
            {SIDES.map((side) => {
              const slots = room.doorSlots.filter((s) => s.side === side);
              return (
                <div key={side} className="editor-doors-side">
                  <span className="editor-doors-label">{SIDE_LABEL[side]}</span>
                  {slots.map((slot, i) => (
                    <span key={i} className="editor-door-slot">
                      <input
                        type="number"
                        step={0.5}
                        value={slot.offset}
                        onChange={(e) => {
                          const offset = Number(e.target.value);
                          setRoom({
                            ...room,
                            doorSlots: room.doorSlots.map((s) =>
                              s === slot ? { side, offset } : s,
                            ),
                          });
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Quitar puerta ${SIDE_LABEL[side]}`}
                        onClick={() =>
                          setRoom({ ...room, doorSlots: room.doorSlots.filter((s) => s !== slot) })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {slots.length < 2 && (
                    <button
                      type="button"
                      className="editor-btn-small"
                      onClick={() =>
                        setRoom({
                          ...room,
                          doorSlots: [
                            ...room.doorSlots,
                            { side, offset: slots.length === 0 ? 0 : slots[0].offset + DOOR_WIDTH + 0.5 },
                          ],
                        })
                      }
                    >
                      + puerta
                    </button>
                  )}
                </div>
              );
            })}
          </section>

          <section className="editor-section">
            <h2>Colocar</h2>
            <div className="editor-palette">
              <button
                type="button"
                className={`editor-palette-btn ${placing?.type === 'start' ? 'active' : ''}`}
                onClick={() => setPlacing({ type: 'start' })}
              >
                ⦿ inicio
              </button>
              {ENEMY_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`editor-palette-btn ${placing?.type === 'enemy' && placing.kind === kind ? 'active' : ''}`}
                  style={{ borderColor: ENEMY_COLOR[kind] }}
                  onClick={() => setPlacing({ type: 'enemy', kind })}
                >
                  {kind}
                </button>
              ))}
              {HAZARD_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`editor-palette-btn ${placing?.type === 'hazard' && placing.kind === kind ? 'active' : ''}`}
                  style={{ borderColor: HAZARD_COLOR[kind] }}
                  onClick={() => setPlacing({ type: 'hazard', kind })}
                >
                  {kind}
                </button>
              ))}
              {ITEM_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`editor-palette-btn ${placing?.type === 'item' && placing.kind === kind ? 'active' : ''}`}
                  style={{ borderColor: ITEM_COLOR[kind] }}
                  onClick={() => setPlacing({ type: 'item', kind })}
                >
                  {kind}
                </button>
              ))}
            </div>
          </section>

          {selection && (
            <section className="editor-section">
              <h2>Selección</h2>
              {selection.type !== 'start' && (
                <div className="editor-field-row">
                  <button type="button" className="editor-btn" onClick={duplicateSelected}>
                    Duplicar
                  </button>
                  <button type="button" className="editor-btn editor-btn-danger" onClick={deleteSelected}>
                    Borrar
                  </button>
                </div>
              )}
              {selection.type === 'start' && <p className="editor-hint">Inicio del jugador (arrástralo en el lienzo).</p>}

              {selectedEnemy && (
                <EnemyProperties
                  enemy={selectedEnemy}
                  onChange={(updated) =>
                    setRoom({
                      ...room,
                      enemies: room.enemies.map((e) => (e.id === updated.id ? updated : e)),
                    })
                  }
                />
              )}
              {selectedHazard && (
                <HazardProperties
                  hazard={selectedHazard}
                  onChange={(updated) =>
                    setRoom({
                      ...room,
                      hazards: room.hazards.map((h) => (h.id === updated.id ? updated : h)),
                    })
                  }
                />
              )}
              {selectedItem && <p className="editor-hint">{selectedItem.kind} · arrástralo para moverlo.</p>}
            </section>
          )}

          <section className="editor-section">
            <h2>Archivo</h2>
            <div className="editor-field-row">
              <button type="button" className="editor-btn" onClick={() => void exportRoom()}>
                Exportar
              </button>
              <button type="button" className="editor-btn" onClick={() => fileInputRef.current?.click()}>
                Importar
              </button>
            </div>
            {import.meta.env.DEV && (
              <button type="button" className="editor-btn editor-btn-wide" onClick={() => void saveToDevServer()}>
                Guardar en src/levels (dev)
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importRoom(file);
                e.target.value = '';
              }}
            />
          </section>

          <section className="editor-section">
            <h2>Validación</h2>
            {errors.length === 0 ? (
              <p className="editor-valid">✓ Sala válida</p>
            ) : (
              <ul className="editor-errors">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Paneles de propiedades ─────────────────────────────────────────────────

function EnemyProperties({ enemy, onChange }: { enemy: EnemySpawn; onChange: (e: EnemySpawn) => void }) {
  return (
    <div>
      <p className="editor-hint">
        {enemy.kind} · <code>{enemy.id}</code>
      </p>
      <div className="editor-field-row">
        <label className="editor-field">
          <span>HP (vacío = defecto)</span>
          <input
            type="number"
            min={1}
            value={enemy.hp ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const next = { ...enemy };
              if (v === '') delete next.hp;
              else next.hp = Number(v);
              onChange(next);
            }}
          />
        </label>
        <label className="editor-field">
          <span>Radio</span>
          <input
            type="number"
            min={0.1}
            step={0.05}
            value={enemy.radius ?? ''}
            placeholder="0.4"
            onChange={(e) => {
              const v = e.target.value;
              const next = { ...enemy };
              if (v === '') delete next.radius;
              else next.radius = Number(v);
              onChange(next);
            }}
          />
        </label>
      </div>
      <label className="editor-tag">
        <input
          type="checkbox"
          checked={enemy.patrolTarget !== undefined}
          onChange={(e) => {
            const next = { ...enemy };
            if (e.target.checked) {
              next.patrolTarget = { x: snap(enemy.position.x + 2), y: enemy.position.y };
            } else {
              delete next.patrolTarget;
            }
            onChange(next);
          }}
        />
        Patrulla con destino
      </label>
      {enemy.patrolTarget && (
        <div className="editor-field-row">
          <label className="editor-field">
            <span>Destino X</span>
            <input
              type="number"
              step={0.5}
              value={enemy.patrolTarget.x}
              onChange={(e) =>
                onChange({ ...enemy, patrolTarget: { x: Number(e.target.value), y: enemy.patrolTarget!.y } })
              }
            />
          </label>
          <label className="editor-field">
            <span>Destino Y</span>
            <input
              type="number"
              step={0.5}
              value={enemy.patrolTarget.y}
              onChange={(e) =>
                onChange({ ...enemy, patrolTarget: { x: enemy.patrolTarget!.x, y: Number(e.target.value) } })
              }
            />
          </label>
        </div>
      )}
      {enemy.kind === 'spike' && (
        <div className="editor-field">
          <span>Dirección de la púa</span>
          <div className="editor-field-row">
            {(
              [
                ['↑', { x: 0, y: -1 }],
                ['↓', { x: 0, y: 1 }],
                ['←', { x: -1, y: 0 }],
                ['→', { x: 1, y: 0 }],
              ] as const
            ).map(([label, dir]) => (
              <button
                key={label}
                type="button"
                className={`editor-btn-small ${
                  (enemy.facing?.x ?? 0) === dir.x && (enemy.facing?.y ?? 1) === dir.y ? 'active' : ''
                }`}
                onClick={() => onChange({ ...enemy, facing: { x: dir.x, y: dir.y } })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HazardProperties({ hazard, onChange }: { hazard: HazardSpawn; onChange: (h: HazardSpawn) => void }) {
  return (
    <div>
      <p className="editor-hint">
        {hazard.kind} · <code>{hazard.id}</code>
      </p>
      <div className="editor-field-row">
        <label className="editor-field">
          <span>Ancho</span>
          <input
            type="number"
            min={0.2}
            step={0.2}
            value={hazard.width}
            onChange={(e) => onChange({ ...hazard, width: Number(e.target.value) })}
          />
        </label>
        <label className="editor-field">
          <span>Alto</span>
          <input
            type="number"
            min={0.2}
            step={0.2}
            value={hazard.height}
            onChange={(e) => onChange({ ...hazard, height: Number(e.target.value) })}
          />
        </label>
      </div>
      {hazard.kind === 'boost' && (
        <div className="editor-field">
          <span>Dirección del impulso</span>
          <div className="editor-field-row">
            {(
              [
                ['↑', { x: 0, y: -1 }],
                ['↓', { x: 0, y: 1 }],
                ['←', { x: -1, y: 0 }],
                ['→', { x: 1, y: 0 }],
              ] as const
            ).map(([label, dir]) => (
              <button
                key={label}
                type="button"
                className={`editor-btn-small ${
                  (hazard.direction?.x ?? 0) === dir.x && (hazard.direction?.y ?? 1) === dir.y ? 'active' : ''
                }`}
                onClick={() => onChange({ ...hazard, direction: { x: dir.x, y: dir.y } })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

