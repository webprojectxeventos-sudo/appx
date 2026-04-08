// Filtro de palabrotas para el chat
// Se ejecuta client-side antes de enviar el mensaje

const BANNED_WORDS = [
  // Insultos comunes en español
  'puta', 'puto', 'putada', 'putas', 'putos',
  'mierda', 'mierdas', 'mierdoso', 'mierdosa',
  'joder', 'jodido', 'jodida', 'jodidos', 'jodidas',
  'gilipollas', 'gilipolla', 'gilipollez',
  'cabrón', 'cabron', 'cabrona', 'cabrones',
  'coño', 'cono', 'coñazo',
  'hostia', 'hostias', 'ostia', 'ostias',
  'capullo', 'capullos',
  'imbécil', 'imbecil', 'imbéciles', 'imbeciles',
  'idiota', 'idiotas',
  'subnormal', 'subnormales',
  'maricón', 'maricon', 'marica', 'maricones',
  'bollera', 'bolleras',
  'zorra', 'zorras', 'zorro',
  'mamón', 'mamon', 'mamona',
  'pendejo', 'pendeja', 'pendejos',
  'verga', 'vergas',
  'chingar', 'chingada', 'chingado',
  'culero', 'culera',
  'huevón', 'huevon',
  'cojones', 'cojón', 'cojon',
  'follar', 'follada', 'follado',
  'pajero', 'pajera',
  'tonto', 'tonta', 'tontos', 'tontas',
  'retrasado', 'retrasada', 'retrasados',
  'mongolo', 'mongola', 'mongolos',
  'hijo de puta', 'hijoputa', 'hijaputa',
  'me cago en', 'mecagoen',
  'polla', 'pollas',
  'cojonudo', // puede ser positivo pero mejor filtrar
  'la madre que', 'tu madre',
  'negro de mierda', 'puto negro',
  'puto moro', 'mora de mierda',
  'sudaca', 'sudacas',
  'chino de mierda',
  // Drogas
  'droga', 'drogas', 'cocaína', 'cocaina', 'mdma', 'éxtasis', 'extasis',
  'porro', 'porros', 'maria', 'marihuana',
  // Alcohol (en contexto de menores, mejor ser cuidadosos)
  // No filtrar alcohol porque es relevante para la app
]

// Crear regex de cada palabra con soporte para variaciones con acentos
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createWordRegex(word: string): RegExp {
  // Reemplazar vocales con versiones con/sin acento
  let pattern = escapeRegex(word)
    .replace(/a/gi, '[aáà]')
    .replace(/e/gi, '[eéè]')
    .replace(/i/gi, '[iíì]')
    .replace(/o/gi, '[oóò]')
    .replace(/u/gi, '[uúùü]')
    .replace(/n/gi, '[nñ]')

  // Si la palabra tiene espacios (frases como "hijo de puta"), no añadir word boundaries
  if (word.includes(' ')) {
    return new RegExp(pattern, 'gi')
  }

  return new RegExp(`\\b${pattern}\\b`, 'gi')
}

const WORD_REGEXES = BANNED_WORDS.map((word) => ({
  regex: createWordRegex(word),
  replacement: '*'.repeat(Math.max(word.replace(/ /g, '').length, 3)),
}))

/**
 * Filtra palabrotas de un texto, reemplazándolas con ****
 * @returns El texto censurado
 */
export function filterProfanity(text: string): string {
  let filtered = text

  // Primero las frases más largas (para que "hijo de puta" se filtre antes que "puta")
  const sorted = [...WORD_REGEXES].sort(
    (a, b) => b.replacement.length - a.replacement.length
  )

  for (const { regex, replacement } of sorted) {
    filtered = filtered.replace(regex, replacement)
  }

  return filtered
}

/**
 * Comprueba si un texto contiene palabrotas
 */
export function containsProfanity(text: string): boolean {
  return WORD_REGEXES.some(({ regex }) => {
    regex.lastIndex = 0 // Reset regex state
    return regex.test(text)
  })
}
