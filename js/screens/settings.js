import { el } from '../ui.js';

export function render(container) {
  container.append(el('p', { class: 'empty' }, 'Pronto: settings'));
}
