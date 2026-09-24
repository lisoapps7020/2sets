import { el, fmtNum, fmtDate, todayISO, toast, confirmDialog } from '../ui.js';
import { getProfile, saveProfile, getAll, put, del, latestBodyweight, exportAll, importAll, validateExport, ensureSeeds, listMeasurements } from '../db.js';
import { clampRest, EXERCISES } from '../model.js';
import { uid } from '../templates.js';
import { applyTheme } from '../app.js';
import { measureForm } from '../measure.js';
import { weeklyAvg, bodyFatOf } from '../body.js';

let c = null;
let navigate = () => {};
let profile = null;

export async function render(container, ctx) {
  c = container;
  navigate = ctx.navigate;
  await ensureSeeds();
  profile = await getProfile();
  await draw();
}

async function persistProfile() {
  try { await saveProfile(profile); } catch { toast('No se pudo guardar', 'error'); }
}

function card(title, ...children) {
  return el('section', { class: 'card', dataset: { section: title } }, el('p', { class: 'label-caps' }, title), ...children);
}

function field(label, input) {
  return el('div', { class: 'field' }, el('label', {}, label), input);
}

async function draw() {
  const [bwRows, bands, extras, measurements] = await Promise.all([getAll('bodyweight'), getAll('bands'), getAll('extras'), listMeasurements()]);
  bwRows.sort((a, b) => b.date.localeCompare(a.date));
  extras.sort((a, b) => a.name.localeCompare(b.name));
  const latest = bwRows[0] || null;

  // Perfil
  const nameInput = el('input', { class: 'input', type: 'text', value: profile.name, placeholder: 'Tu nombre', autocomplete: 'given-name',
    onchange: (e) => { profile.name = e.target.value.trim(); persistProfile(); } });
  const perfil = card('Perfil', field('Nombre', nameInput));

  // Peso corporal
  const kgInput = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.1', min: '20', placeholder: 'kg', 'aria-label': 'Peso corporal' });
  const dateInput = el('input', { class: 'input', type: 'date', value: todayISO(), 'aria-label': 'Fecha del peso' });
  const peso = card('Peso corporal',
    el('p', { class: 'muted small' }, latest ? `Último: ${fmtNum(latest.kg)} kg el ${fmtDate(latest.date, { weekday: false })}` : 'Todavía no cargaste tu peso. Hace falta para la carga total y el 1RM.'),
    el('div', { class: 'grid-2' }, field('Kilos', kgInput), field('Fecha', dateInput)),
    el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
      const kg = Number(kgInput.value);
      if (!(kg > 20 && kg < 300)) { toast('Ingresá un peso válido', 'error'); return; }
      try { await put('bodyweight', { id: uid('bw'), date: dateInput.value || todayISO(), kg: Math.round(kg * 10) / 10 }); toast('Peso guardado', 'ok'); draw(); }
      catch { toast('No se pudo guardar', 'error'); }
    } }, 'Guardar peso'),
    bwRows.length ? el('div', { class: 'list' }, ...bwRows.slice(0, 5).map((r) => el('div', { class: 'list-item' },
      el('span', {}, `${fmtNum(r.kg)} kg`), el('span', { class: 'muted small' }, fmtDate(r.date, { weekday: false })),
      el('button', { type: 'button', class: 'link', onclick: async () => { try { await del('bodyweight', r.id); draw(); } catch { toast('No se pudo borrar', 'error'); } } }, 'Borrar'),
    ))) : null,
  );

  // Cuerpo: sexo, altura, objetivo y mediciones
  const segOf = (key, options, current, onPick) => el('div', { class: 'seg', dataset: { body: key } }, ...options.map(([k, l]) => el('button', {
    type: 'button', class: 'seg-btn' + (current === k ? ' on' : ''), onclick: () => onPick(k),
  }, l)));
  const heightInput = el('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '100', max: '250', step: '1', placeholder: 'cm', dataset: { body: 'height' }, value: profile.heightCm ?? '',
    onchange: (e) => { const v = Number(e.target.value); profile.heightCm = v >= 100 && v <= 250 ? v : null; persistProfile(); } });
  const targetWeight = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.5', placeholder: 'kg', dataset: { body: 'targetWeight' }, value: profile.goal.targetWeightKg ?? '',
    onchange: (e) => { const v = Number(e.target.value); profile.goal.targetWeightKg = v > 20 && v < 300 ? v : null; persistProfile(); } });
  const targetFat = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.5', placeholder: '%', dataset: { body: 'targetFat' }, value: profile.goal.targetBodyFatPct ?? '',
    onchange: (e) => { const v = Number(e.target.value); profile.goal.targetBodyFatPct = v >= 2 && v <= 60 ? v : null; persistProfile(); } });
  const measureHost = el('div');
  const cuerpo = card('Cuerpo',
    el('p', { class: 'muted small' }, 'Sexo y altura se usan para estimar la grasa corporal con cinta métrica.'),
    el('div', { class: 'field' }, el('label', {}, 'Sexo'), segOf('sex', [['m', 'Hombre'], ['f', 'Mujer']], profile.sex, (k) => { profile.sex = k; persistProfile(); draw(); })),
    field('Altura (cm)', heightInput),
    el('div', { class: 'field' }, el('label', {}, 'Objetivo'), segOf('goal', [['bajar', 'Bajar'], ['mantener', 'Mantener'], ['subir', 'Subir']], profile.goal.direction, (k) => {
      profile.goal.direction = k;
      profile.goal.setAt = todayISO();
      profile.goal.startWeightKg = weeklyAvg(bwRows, todayISO()) ?? latest?.kg ?? null;
      persistProfile();
      draw();
    })),
    el('div', { class: 'grid-2' }, field('Peso objetivo (kg)', targetWeight), field('Grasa objetivo (%)', targetFat)),
    profile.goal.setAt ? el('p', { class: 'muted small' }, `Objetivo fijado el ${fmtDate(profile.goal.setAt, { weekday: false })}${profile.goal.startWeightKg ? ` desde ${fmtNum(profile.goal.startWeightKg)} kg` : ''}.`) : null,
    el('p', { class: 'label-caps', style: { marginTop: '8px' } }, 'Mediciones'),
    measurements.length ? el('div', { class: 'list' }, ...measurements.slice(0, 5).map((m) => {
      const bf = bodyFatOf(m, profile);
      return el('div', { class: 'list-item' },
        el('span', {}, bf === null ? 'sin estimación' : `${fmtNum(bf)} %`, el('span', { class: 'muted small' }, ` · ${m.source}`)),
        el('span', { class: 'muted small' }, fmtDate(m.date, { weekday: false })),
        el('button', { type: 'button', class: 'link', onclick: async () => { try { await del('measurements', m.id); draw(); } catch { toast('No se pudo borrar', 'error'); } } }, 'Borrar'),
      );
    })) : el('p', { class: 'muted small' }, 'Todavía no hay mediciones.'),
    el('button', { type: 'button', class: 'btn', onclick: () => {
      measureHost.replaceChildren(measureForm({ profile, onSaved: () => draw(), onCancel: () => measureHost.replaceChildren() }));
      measureHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, 'Registrar medidas'),
    measureHost,
  );

  // Descansos
  const restInput = (key, label) => field(label, el('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '3', max: '7', step: '0.5', value: String(profile[key] / 60),
    onchange: (e) => { profile[key] = clampRest(Number(e.target.value) * 60); e.target.value = String(profile[key] / 60); persistProfile(); } }));
  const descansos = card('Descansos',
    el('p', { class: 'muted small' }, 'Entre 3 y 7 minutos. Se pueden ajustar durante el descanso.'),
    el('div', { class: 'grid-2' }, restInput('restMainSec', 'Series principales (min)'), restInput('restApproachSec', 'Aproximación y extras (min)')),
  );

  // Incrementos
  const incSelect = (key, label) => field(label, el('select', { class: 'select', onchange: (e) => { profile.incrementKg[key] = Number(e.target.value); persistProfile(); } },
    ...[5, 2.5].map((v) => el('option', { value: String(v), selected: profile.incrementKg[key] === v }, `${fmtNum(v)} kg`))));
  const incrementos = card('Incrementos',
    el('p', { class: 'muted small' }, 'El método arranca con 5 kg y pasa a 2,5 cuando subir 5 te tira las reps.'),
    incSelect('dips', EXERCISES.dips.name), incSelect('pullups', EXERCISES.pullups.name), incSelect('second', 'Segundo ejercicio'),
  );

  // Bandas
  const bName = el('input', { class: 'input', type: 'text', placeholder: 'Nombre', 'aria-label': 'Nombre de banda' });
  const bColor = el('input', { class: 'input', type: 'color', value: '#b03a2e', 'aria-label': 'Color de banda', style: { padding: '2px', height: '48px' } });
  const bAssist = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '2.5', min: '1', placeholder: 'kg', 'aria-label': 'Asistencia en kg' });
  const bandas = card('Bandas elásticas',
    el('p', { class: 'muted small' }, 'Asistencia estimada en kilos: se resta de la carga total.'),
    el('div', { class: 'list' }, ...bands.sort((a, b) => a.assistKg - b.assistKg).map((b) => el('div', { class: 'list-item' },
      el('span', { class: 'row' }, el('i', { style: { display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: b.color || '#888' } }), b.name),
      el('span', { class: 'muted small' }, `−${fmtNum(b.assistKg)} kg`),
      el('button', { type: 'button', class: 'link', onclick: async () => { try { await del('bands', b.id); draw(); } catch { toast('No se pudo borrar', 'error'); } } }, 'Borrar'),
    ))),
    el('div', { class: 'row' }, bName, bColor, bAssist),
    el('button', { type: 'button', class: 'btn', onclick: async () => {
      const name = bName.value.trim(); const assistKg = Number(bAssist.value);
      if (!name || !(assistKg > 0)) { toast('Completá nombre y kilos', 'error'); return; }
      try { await put('bands', { id: uid('band'), name, color: bColor.value, assistKg }); toast('Banda agregada', 'ok'); draw(); } catch { toast('No se pudo guardar', 'error'); }
    } }, 'Agregar banda'),
  );

  // Complementarios
  const eName = el('input', { class: 'input', type: 'text', placeholder: 'Ejercicio', 'aria-label': 'Nombre del complementario' });
  const eDay = el('select', { class: 'select', 'aria-label': 'Día' }, el('option', { value: 'any' }, 'Ambos días'), el('option', { value: 'push' }, 'Push'), el('option', { value: 'pull' }, 'Pull'));
  const dayLabel = { any: 'ambos', push: 'push', pull: 'pull' };
  const complementarios = card('Complementarios',
    el('div', { class: 'list' }, ...extras.map((x) => el('div', { class: 'list-item' },
      el('span', { class: x.archived ? 'muted' : '' }, x.name, el('span', { class: 'muted small' }, ` · ${dayLabel[x.day] || x.day}`)),
      el('span', { class: 'row' },
        el('button', { type: 'button', class: 'link', onclick: async () => { try { await put('extras', { ...x, archived: !x.archived }); draw(); } catch { toast('No se pudo guardar', 'error'); } } }, x.archived ? 'Activar' : 'Archivar'),
        el('button', { type: 'button', class: 'link', onclick: async () => { try { await del('extras', x.id); draw(); } catch { toast('No se pudo borrar', 'error'); } } }, 'Borrar'),
      ),
    ))),
    el('div', { class: 'row' }, eName, eDay),
    el('button', { type: 'button', class: 'btn', onclick: async () => {
      const name = eName.value.trim();
      if (!name) { toast('Escribí el nombre', 'error'); return; }
      try { await put('extras', { id: uid('ex'), name, day: eDay.value, archived: false }); toast('Agregado', 'ok'); draw(); } catch { toast('No se pudo guardar', 'error'); }
    } }, 'Agregar complementario'),
  );

  // Tema
  let theme = 'auto';
  try { theme = localStorage.getItem('theme') || 'auto'; } catch {}
  const tema = card('Tema',
    el('div', { class: 'seg' }, ...[['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => el('button', { type: 'button', class: 'seg-btn' + (theme === k ? ' on' : ''), onclick: () => {
      try { localStorage.setItem('theme', k); } catch {}
      applyTheme();
      draw();
    } }, l))),
  );

  // Datos
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, 'aria-label': 'Archivo de backup' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('El archivo no es un JSON válido', 'error'); return; }
    const v = validateExport(data);
    if (!v.ok) { toast(v.error, 'error'); return; }
    if (!(await confirmDialog('Reemplaza todos tus datos por los del archivo. Antes se descarga un backup de lo actual. ¿Seguir?'))) return;
    try {
      await downloadBackup();
      await importAll(data);
      toast('Datos importados', 'ok');
      navigate('#/inicio');
    } catch (e) { toast(e.message || 'No se pudo importar', 'error'); }
    fileInput.value = '';
  });
  const datos = card('Datos',
    el('p', { class: 'muted small' }, 'Todo vive en este dispositivo. Exportá un backup cada tanto.'),
    el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => { try { await downloadBackup(); toast('Backup descargado', 'ok'); } catch { toast('No se pudo exportar', 'error'); } } }, 'Exportar backup'),
      el('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Importar backup'),
    ),
    fileInput,
  );

  // Método
  const metodo = card('El método',
    el('p', { class: 'small' }, 'Fondos: serie 1 al fallo cerca de 10 reps, serie 2 con 20 a 25% menos, meta 15. Dominadas: 8 y 12. Al llegar a la meta sumás el incremento la próxima; si no, mismo peso. Segundo ejercicio: 2 series de 12 a 15 al fallo, sumás carga cuando las dos llegan a 15. Descansos de 5 a 7 minutos entre series principales. Siempre max out, nunca apuntar a un número.'),
  );

  c.replaceChildren(el('h1', {}, 'Ajustes'), perfil, peso, cuerpo, descansos, incrementos, bandas, complementarios, tema, datos, metodo);
}

async function downloadBackup() {
  const data = await exportAll();
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `2sets-backup-${todayISO()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
