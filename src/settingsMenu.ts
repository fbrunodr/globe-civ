// The settings menu: a small gear button in the bottom-right corner (beside
// the page's View bar, where it has one) that opens the graphics options:
// shadows and tone mapping, each on or off, and the rendering resolution. Shared by the game, the City Lab and World view; the choices
// are remembered in this browser (and only there: a convenience, the game
// works the same without them).

import { RESOLUTIONS, type GlobeRenderer, type Resolution } from './render.ts';

interface Settings { shadows: boolean; toneMapping: boolean; resolution: Resolution }
// The resolution choices as shown.
const RESOLUTION_NAME: Record<Resolution, string> = { 2: 'Sharp', 1.5: 'Balanced', 1: 'Fast' };
const isResolution = (x: unknown): x is Resolution => RESOLUTIONS.some((r) => r === x);
const KEY = 'civ.settings';

function load(view: GlobeRenderer): Settings {
  const s: Settings = { shadows: view.shadows, toneMapping: view.toneMapped, resolution: view.resolution };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Settings, unknown>>;
    if (typeof raw.shadows === 'boolean') s.shadows = raw.shadows;
    if (typeof raw.toneMapping === 'boolean') s.toneMapping = raw.toneMapping;
    if (isResolution(raw.resolution)) s.resolution = raw.resolution;
  } catch { /* (no storage: the defaults) */ }
  return s;
}
function save(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* (no storage: not remembered) */ }
}

export function mountSettings(view: GlobeRenderer): void {
  const s = load(view);
  view.setShadows(s.shadows);
  view.setToneMapping(s.toneMapping);
  view.setResolution(s.resolution);

  const wrap = document.createElement('div');
  wrap.id = 'settings';
  wrap.innerHTML = `
    <button id="settingsBtn" class="panel" title="Settings" aria-label="Settings" aria-expanded="false">⚙</button>
    <div id="settingsMenu" class="panel hidden" role="menu">
      <h4>Graphics</h4>
      <label><input type="checkbox" id="setShadows"> Shadows</label>
      <label><input type="checkbox" id="setTone"> Tone mapping</label>
      <label title="Fewer pixels: smoother on a modest graphics card">Resolution <select id="setRes">${RESOLUTIONS.map((r) => `<option value="${r}">${RESOLUTION_NAME[r]}</option>`).join('')}</select></label>
    </div>`;
  // The dock in the bottom-right corner: the View bar (if the page has one), then the gear.
  const dock = document.createElement('div');
  dock.id = 'dock';
  const views = document.getElementById('views');
  if (views) dock.append(views);
  dock.append(wrap);
  document.body.append(dock);
  const btn = wrap.querySelector<HTMLButtonElement>('#settingsBtn')!, menu = wrap.querySelector<HTMLDivElement>('#settingsMenu')!;
  const shadows = wrap.querySelector<HTMLInputElement>('#setShadows')!, tone = wrap.querySelector<HTMLInputElement>('#setTone')!;
  const res = wrap.querySelector<HTMLSelectElement>('#setRes')!;
  res.value = String(s.resolution);
  shadows.checked = s.shadows;
  tone.checked = s.toneMapping;
  const open = (on: boolean) => { menu.classList.toggle('hidden', !on); btn.setAttribute('aria-expanded', String(on)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); open(menu.classList.contains('hidden')); btn.blur(); });
  // (A click anywhere else, or Escape, closes it.)
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target as Node)) open(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  shadows.addEventListener('change', () => { s.shadows = shadows.checked; view.setShadows(s.shadows); save(s); });
  tone.addEventListener('change', () => { s.toneMapping = tone.checked; view.setToneMapping(s.toneMapping); save(s); });
  res.addEventListener('change', () => {
    const r = Number(res.value);
    if (!isResolution(r)) return;
    s.resolution = r; view.setResolution(r); save(s);
  });
}
