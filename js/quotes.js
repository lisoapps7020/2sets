// Citas estoicas cortas. Una por día, determinista por fecha.
export const QUOTES = [
  { text: 'No es que tengamos poco tiempo, sino que perdemos mucho.', author: 'Séneca' },
  { text: 'La dificultad muestra lo que los hombres son.', author: 'Epicteto' },
  { text: 'Lo que se interpone en el camino se convierte en el camino.', author: 'Marco Aurelio' },
  { text: 'Nadie es libre si no es dueño de sí mismo.', author: 'Epicteto' },
  { text: 'Muy poco se necesita para hacer una vida feliz; está todo dentro de vos.', author: 'Marco Aurelio' },
  { text: 'Sufrimos más en la imaginación que en la realidad.', author: 'Séneca' },
  { text: 'No expliques tu filosofía. Encarnala.', author: 'Epicteto' },
  { text: 'Dejá de discutir cómo debería ser un buen hombre. Sé uno.', author: 'Marco Aurelio' },
  { text: 'Ningún hombre es libre si no se gobierna a sí mismo.', author: 'Séneca' },
  { text: 'Primero decí qué querés ser; después hacé lo que tengas que hacer.', author: 'Epicteto' },
  { text: 'Tenés poder sobre tu mente, no sobre los hechos. Entendé eso y encontrarás fuerza.', author: 'Marco Aurelio' },
  { text: 'La suerte es lo que pasa cuando la preparación se encuentra con la oportunidad.', author: 'Séneca' },
  { text: 'No busques que las cosas pasen como querés; querelas como pasan.', author: 'Epicteto' },
  { text: 'Al amanecer, cuando te cueste levantarte, pensá: me levanto para hacer el trabajo de un ser humano.', author: 'Marco Aurelio' },
  { text: 'Cada nuevo comienzo viene del final de otro comienzo.', author: 'Séneca' },
  { text: 'Es imposible aprender lo que uno cree que ya sabe.', author: 'Epicteto' },
  { text: 'Confinate al presente.', author: 'Marco Aurelio' },
  { text: 'Difícil no es lo mismo que imposible.', author: 'Séneca' },
  { text: 'Ningún gran logro llega de golpe. Ni siquiera la uva o el higo.', author: 'Epicteto' },
  { text: 'El objeto de la vida no es estar del lado de la mayoría, sino escapar de las filas de los locos.', author: 'Marco Aurelio' },
  { text: 'Mientras esperamos vivir, la vida pasa.', author: 'Séneca' },
  { text: 'Hacé lo que debas y aceptá lo que venga.', author: 'Epicteto' },
  { text: 'La mejor venganza es no ser como el que te hizo daño.', author: 'Marco Aurelio' },
  { text: 'El cuerpo debe ser tratado con rigor para que no desobedezca a la mente.', author: 'Séneca' },
  { text: 'Hoy escapé de todo, o mejor dicho, tiré todo, porque estaba adentro mío.', author: 'Marco Aurelio' },
  { text: 'Los hombres no se perturban por las cosas, sino por la opinión que tienen de ellas.', author: 'Epicteto' },
];

export function quoteFor(dateISO) {
  const s = String(dateISO || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return QUOTES[h % QUOTES.length];
}
