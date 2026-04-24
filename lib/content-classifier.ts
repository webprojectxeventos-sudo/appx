/**
 * Tiered content classifier for the chat pipeline.
 *
 * Built from the post-mortem of the San Juan Bosco incident (16-17/4/2026).
 * 397 messages slipped through the previous single-tier filter because:
 *   - The dictionary had ~60 common-swear words but nothing drug-specific,
 *     nothing for named-target attacks, nothing for staff impersonation.
 *   - Every match was the same severity (one strike out of 3) regardless of
 *     whether it was "gilipollas" or "llevo fentanilo".
 *   - The 5-minute strike window let users respace their posts and never
 *     hit the 3-strike auto-mute.
 *
 * TIER_1 → permanent ban on first offense (hard drugs, sexual threats,
 *          references to minors, explicit fascist consignas)
 * TIER_2 → instant mute on first offense (staff impersonation, named-target
 *          sexual content, soft drug offers, explicit sexual invitations)
 * TIER_3 → strike (classic profanity — existing 3-strike flow)
 *
 * The classifier is intentionally conservative: only items where a false
 * positive costs us a muted message, never a false positive that costs us a
 * permanent ban on a legitimate user. Every TIER_1 rule is something no
 * reasonable high-schooler would type in a legit graduation-party chat.
 */

// ──────────────────────────────────────────────────────────────────────────
// TIER 1 — INSTANT BAN
// ──────────────────────────────────────────────────────────────────────────

// Hard/dangerous drugs — naming any of these in a party chat is disqualifying
const TIER_1_DRUGS = [
  'fentanilo', 'fentanil', 'fenta',
  'burundanga', 'escopolamina',
  'tusi', 'tussi', 'tusibi', '2cb', '2-cb',
  'ketamina', 'ketas', 'keta',
  'cristal', 'metanfetamina', 'cristales',
  'heroina', 'heroína', 'caballo',
  'crack',
  'lsd', 'tripi', 'tripis', 'ácido',
  'rivotril', 'trankimazin', 'trankis',
  // Slangs for cocaine that are specific enough to flag alone
  'perico', 'farlopa', 'merca', 'farla',
]

// Phrases around supplying/selling drugs — trigger regardless of drug word
const TIER_1_DRUG_SUPPLY_PATTERNS: RegExp[] = [
  // "llevo/traigo/tengo fenta/coca/tusi/honey"
  /\b(?:llevo|traigo|tengo|vendo|pillo|consigo)\s+(?:\w+\s+){0,3}(?:honey|coca|tusi|keta|mdma|cristal|fenta|fentanilo|farla|perico|porro|porros|maria|hachis|hash|speed|anfeta|anfetaminas)\b/i,
  // "quien quiere/necesita coca/tusi/..."
  /\b(?:quien|qn|quién)\s+(?:quiere|necesita|lleva|trae)\s+(?:\w+\s+){0,2}(?:coca|tusi|keta|mdma|cristal|fenta|fentanilo|farla|perico|honey)\b/i,
  // "voy a traer fentanilo/coca" (the classic SJB trigger)
  /\b(?:voy\s+a|vamos\s+a)\s+(?:traer|llevar|meter|pillar)\s+(?:\w+\s+){0,2}(?:fenta|fentanilo|burundanga|tusi|ketamina|cristal|coca|mdma)\b/i,
]

// Sexual violence — the SJB group had "violar", "manada", "casa rural" riffs
const TIER_1_SEXUAL_VIOLENCE = [
  'violar', 'violador', 'violadores', 'violada', 'violadas', 'violación', 'violacion', 'violaciones',
  'violame', 'violarme', 'violarte', 'violarla', 'violarlo',
  'manada',  // referencia explícita a "La Manada"
]

const TIER_1_SEXUAL_VIOLENCE_PATTERNS: RegExp[] = [
  // "forzar sexualmente", "forzar a la..."
  /\bforzar\s+sexualmente\b/i,
  /\bforz(?:ar|o|aste|ó)\s+a\s+(?:una|la|esa|esta)\b/i,
  // "corrida en la casa rural", "trio en la casa rural" (grupo)
  /\b(?:corrida|gangbang|tren)\s+(?:en|de|entre)\s+(?:la|el|los|las)?\s*(?:casa|habitación|habitacion|piso|chalet|rural)\b/i,
  /\bcasa\s+rural\s+(?:f[aá]cilmente|f[aá]cil|tranqui|seguro)\b/i,
  // "dejar una habitación para que se trinque", "trinque a todas"
  /\b(?:dejar|prestar|montar)\s+(?:la|una)\s+(?:habitaci[oó]n|habi|sala|choza)\s+(?:para|y)\s+(?:que\s+)?(?:se\s+)?(?:trinque|follar|tire|monte)/i,
  // Contratar prostitutas
  /\b(?:contratar|traer|pillar|pagar)\s+(?:\w+\s+){0,2}(?:samaritanas?|prostitutas?|putas?|escorts?)\b/i,
  /\bsamaritanas?\s+(?:lo\s+)?paga\b/i,
]

// References to minors — regex rather than word list to handle "14 años", etc.
const TIER_1_MINOR_PATTERNS: RegExp[] = [
  // Ages 10–15 paired with a person/pronoun context
  /\b(?:chica|chico|niña|nino|niño|pibita|pibito|tia|tía|una|un|esa|ese)\s+(?:de\s+)?(?:1[0-5])\s+a[nñ]os\b/i,
  /\b(?:1[0-5])\s+a[nñ]os\b.{0,60}\b(?:chica|chico|niña|nino|niño|follar|enrollarme|liarme|tirar|meter)\b/i,
  /\b(?:follar|tirarme|meterle|enrollarme|liarme)\s+(?:\w+\s+){0,4}(?:1[0-5])\s+a[nñ]os\b/i,
  // Escolar references — "cuarto de la ESO", "primaria", "tercero de la ESO"
  /\b(?:cuarto|tercero|segundo|primero)\s+(?:de\s+(?:la\s+)?)?eso\b.{0,80}\b(?:follar|tirar|cachonda|rica|bollos|meter|chingar|cojer)\b/i,
  /\b(?:follar|tirar|cachonda|rica|meter|cojer)\b.{0,80}\b(?:cuarto|tercero|segundo|primero)\s+(?:de\s+(?:la\s+)?)?eso\b/i,
  /\b(?:primaria|guardería|guarderia)\b.{0,40}\b(?:follar|tirar|cachonda|rica|meter|cojer|pedófilo|pedofilo)\b/i,
  // Sexual verb near "menor de edad"
  /\b(?:menor|menores)\s+de\s+edad\b.{0,60}\b(?:follar|tirar|cachonda|rica|meter|cojer)\b/i,
  /\b(?:follar|tirar|cachonda|rica|meter|cojer)\b.{0,60}\b(?:menor|menores)\s+de\s+edad\b/i,
  // Explicit pedo slurs
  /\bpedófil[oa]s?\b/i,
  /\bpedofil[oa]s?\b/i,
]

// Fascist consignas + explicit hate — all pattern-level (multi-word, context-sensitive)
const TIER_1_HATE_PATTERNS: RegExp[] = [
  /\bjos[eé]\s+antonio\s+primo\s+de\s+rivera\b.{0,20}\bpresente\b/i,
  /\bprimo\s+de\s+rivera\s+presente\b/i,
  /\bcara\s+al\s+sol\b/i,
  /\bviva\s+franco\b/i,
  /\bheil\s+hitler\b/i,
  /\b(?:sieg\s+heil|sieg-heil)\b/i,
  /\b14\s*\/?\s*88\b/,
  /\bgasear\s+a\s+(?:los\s+)?(?:judíos|judios|moros|negros|gitanos)\b/i,
]

// ──────────────────────────────────────────────────────────────────────────
// TIER 2 — INSTANT MUTE
// ──────────────────────────────────────────────────────────────────────────

// Staff/organizer impersonation — classic SJB "somos los organizadores"
const TIER_2_STAFF_IMPERSONATION_PATTERNS: RegExp[] = [
  /\bsomos\s+(?:los\s+)?(?:organizadores?|staff|administradores?|admins?|moderadores?|mods?|de\s+projectx|del?\s+evento)/i,
  /\bsoy\s+(?:el\s+)?(?:organizador|staff|administrador|admin|moderador|mod|del?\s+evento)/i,
  /\b(?:el\s+)?(?:staff|organizaci[oó]n)\s+(?:dice|anuncia|comunica|informa)\b/i,
  /\batenci[oó]n[,.!\s]+soy\s+(?:admin|organizador|staff)/i,
]

// Soft drug slang, sexual invitations against named targets, named-sexual-bait
const TIER_2_SEXUAL_NAMING_PATTERNS: RegExp[] = [
  // "[Nombre Apellido] está cachonda/busca sexo/quiere..."
  /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+(?:busca|quiere|está|esta|anda|pide)\s+(?:sexo|follar|un\s+(?:buen\s+)?polvo|cachonda|caliente|rabo|verga|polla|duro)/i,
  /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+(?:está|esta)\s+cachonda\b/i,
  // "me pone [Nombre] la (quiero|voy a) (dar|meter|follar|hacer)..."
  /\bme\s+pone\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b.{0,40}\b(?:quiero|voy\s+a|la?\s+(?:doy|meto|follo|hago|penetro))\b/i,
  // "dar por todos los sitios", "dar por detrás", "dar por el culo" con nombre
  /\bdar(?:le|la)?\s+(?:por|en)\s+(?:todos\s+los\s+sitios|detr[aá]s|el\s+culo|todos\s+lados)\b/i,
  // Oferta de vender contenido sexual de menor o nombre
  /\b(?:vendo|ofrezco|tengo)\s+(?:un\s+)?v[ií]deo\s+de\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b.{0,40}\b(?:follar|dedear|dedeando|mamar|chupar|paja|coger|follando)/i,
  /\b(?:vendo|ofrezco|paso)\s+(?:el\s+)?v[ií]deo\b.{0,40}\bdedear|dedeando\b/i,
  // Incesto
  /\bhermana\s+de\s+\w+\b.{0,30}\b(?:quiero|voy\s+a|la?\s+(?:doy|meto|follo|penetro))\b/i,
]

// Soft drug slang alone (coca, porro, papela) — mute, not ban
const TIER_2_SOFT_DRUG_PATTERNS: RegExp[] = [
  // "quien lleva la coca", "coca por aquí"
  /\b(?:quien|qn|quién)\s+(?:lleva|tiene|trae|pilla|consigue)\s+(?:la\s+)?(?:coca|maria|maría|porro|porros|honey|speed|mdma|pollo|pollos|pollito|pollitos|pirula|pirulas)\b/i,
  /\b(?:un\s+)?gramo\b.{0,30}\bpor\s+(?:el\s+)?culo\b/i, // alusión explícita al uso
  // Slang specific / demandas
  /\bblue\s+bird\b.{0,30}\b(?:mezcla|coca|chongo|papela)/i,
  /\bhoney\s+(?:gente|aquí|aqui|encima|por)\b/i,
  // MDMA slang pidiendo/ofreciendo — "medio pollo", "pilla un pollo", "quien trae pirulas"
  /\b(?:medio|un|dos|tres|cuatro)\s+(?:pollo|pollos|pollito|pollitos|pirula|pirulas|cristal)\b/i,
  /\b(?:pilla|trae|mete|mando|manda|mándame|mándame)\s+(?:un|una|medio|dos)\s+(?:pollo|pollito|pirula|cristal|maria|porro)\b/i,
  // "quien regala/regalan M/mdma/éxtasis" — ask for free drugs
  /\b(?:quien|qn|quién)\s+(?:regala|lleva|trae|da)\s+(?:la\s+)?(?:m|mdma|mdm|éxtasis|extasis|éxtasi|extasi|éxta|exta)\b/i,
  /\b(?:a\s+qu[eé]\s+hora|cu[aá]ndo|cuando)\s+(?:regala|regalan|dan|reparten|pasan)\s+(?:la\s+)?(?:m|mdma|mdm|éxtasis|extasis)\b/i,
  /\bregalan?\s+(?:la\s+)?m\b(?!\s+(?:[aá]s|i|ismo|inuto|omento|[eé]s))/i,
]

// Hate speech soft — mute not ban
const TIER_2_SLUR_PATTERNS: RegExp[] = [
  // Repeated homophobic slur in hostile context (not a one-off "maricón" as exclamation)
  /\b(?:puto|putos|puta|putas)\s+(?:maric[oó]n|maric[oó]nes|gay|negro|moro|chino|sudaca|gitano)\b/i,
  /\b(?:negro|moro|chino|sudaca|gitano)\s+de\s+mierda\b/i,
  /\bmaric[oó]n\s+de\s+mierda\b/i,
]

// ──────────────────────────────────────────────────────────────────────────
// TIER 3 — STRIKE (classic profanity — preserves original behavior)
// ──────────────────────────────────────────────────────────────────────────

const TIER_3_WORDS = [
  // Classic insults (kept from original list)
  'puta', 'puto', 'putada', 'putas', 'putos', 'putero', 'puteros',
  'perra', 'perras', 'hijo de perra', 'hija de perra',
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
  'pajero', 'pajera', 'pajillero',
  'retrasado', 'retrasada', 'retrasados',
  'mongolo', 'mongola', 'mongolos',
  'hijo de puta', 'hijoputa', 'hijaputa',
  'me cago en', 'mecagoen',
  'polla', 'pollas', 'pollón', 'pollon',
  'nabo', 'nabos', 'nabazo',
  // Sex verbs + body parts — mild
  'follar', 'follada', 'follado', 'follame', 'follamos',
  'chocho', 'chochos', 'chochete',
  'rajita', 'rajiya', 'rajilla',
  'dildo', 'consolador',
  'corrida', 'corrido', 'corrido',
  'cachonda', 'cachondo', 'cachondas', 'cachondos',
  'mojadita', 'mojadito', 'mojaditas',
  'chorva', 'chorvas', 'chorvo', 'chorvos',
  'perrita', 'perritas', 'perreo',
  'putonga', 'putongas',
  // Racist slurs kept
  'sudaca', 'sudacas',
  'chino de mierda',
  'negro de mierda', 'puto negro',
  'puto moro', 'mora de mierda',
  // Drugs (generic nouns — harder drugs are in TIER_1)
  'droga', 'drogas', 'cocaína', 'cocaina', 'coca', 'mdma', 'éxtasis', 'extasis',
  'porro', 'porros', 'maria', 'marihuana', 'hachis', 'hachís', 'hash',
  'speed', 'anfeta', 'anfetaminas',
]

// ──────────────────────────────────────────────────────────────────────────
// Regex utilities (accent-insensitive, word-boundary-respecting)
// ──────────────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createWordRegex(word: string): RegExp {
  const pattern = escapeRegex(word)
    .replace(/a/gi, '[aáà]')
    .replace(/e/gi, '[eéè]')
    .replace(/i/gi, '[iíì]')
    .replace(/o/gi, '[oóò]')
    .replace(/u/gi, '[uúùü]')
    .replace(/n/gi, '[nñ]')

  // Phrases (with spaces) skip word boundaries — they already anchor naturally.
  if (word.includes(' ')) return new RegExp(pattern, 'gi')
  return new RegExp(`\\b${pattern}\\b`, 'gi')
}

const TIER_1_DRUG_REGEXES = TIER_1_DRUGS.map((w) => ({ word: w, re: createWordRegex(w) }))
const TIER_1_SEXUAL_VIOLENCE_REGEXES = TIER_1_SEXUAL_VIOLENCE.map((w) => ({ word: w, re: createWordRegex(w) }))

const TIER_3_REGEXES = TIER_3_WORDS.map((word) => ({
  word,
  regex: createWordRegex(word),
  replacement: '*'.repeat(Math.max(word.replace(/ /g, '').length, 3)),
}))

// ──────────────────────────────────────────────────────────────────────────
// Classifier
// ──────────────────────────────────────────────────────────────────────────

export type ContentTier = 1 | 2 | 3

export type ContentCategory =
  | 'hard_drugs'
  | 'drug_supply'
  | 'sexual_violence'
  | 'minors'
  | 'hate_extreme'
  | 'staff_impersonation'
  | 'sexual_naming'
  | 'soft_drugs'
  | 'slur'
  | 'profanity'

export interface ClassificationResult {
  tier: ContentTier
  category: ContentCategory
  match: string
}

/**
 * Collapse common leetspeak/evasion tricks so "puter0" → "putero",
 * "p0rr0" → "porro", "h1j0 d3 p3rr4" → "hijo de perra". Runs BEFORE the
 * classifier so we can test both the original and the normalized form and
 * match whichever trips first.
 *
 * Intentionally conservative: digits → letters only (0→o, 1→i, 3→e, 4→a,
 * 5→s, 7→t, 8→b). We don't collapse @/$/! because those produce too many
 * false positives in legit messages (prices, exclamations, etc.).
 */
function normalizeLeet(text: string): string {
  return text
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
}

function classifyOne(text: string): ClassificationResult | null {
  if (!text) return null

  // ── TIER 1 ──────────────────────────────────────────────────────────────
  for (const { word, re } of TIER_1_DRUG_REGEXES) {
    re.lastIndex = 0
    if (re.test(text)) return { tier: 1, category: 'hard_drugs', match: word }
  }
  for (const re of TIER_1_DRUG_SUPPLY_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 1, category: 'drug_supply', match: m[0].slice(0, 40) }
  }
  for (const { word, re } of TIER_1_SEXUAL_VIOLENCE_REGEXES) {
    re.lastIndex = 0
    if (re.test(text)) return { tier: 1, category: 'sexual_violence', match: word }
  }
  for (const re of TIER_1_SEXUAL_VIOLENCE_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 1, category: 'sexual_violence', match: m[0].slice(0, 40) }
  }
  for (const re of TIER_1_MINOR_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 1, category: 'minors', match: m[0].slice(0, 40) }
  }
  for (const re of TIER_1_HATE_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 1, category: 'hate_extreme', match: m[0].slice(0, 40) }
  }

  // ── TIER 2 ──────────────────────────────────────────────────────────────
  for (const re of TIER_2_STAFF_IMPERSONATION_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 2, category: 'staff_impersonation', match: m[0].slice(0, 40) }
  }
  for (const re of TIER_2_SEXUAL_NAMING_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 2, category: 'sexual_naming', match: m[0].slice(0, 40) }
  }
  for (const re of TIER_2_SOFT_DRUG_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 2, category: 'soft_drugs', match: m[0].slice(0, 40) }
  }
  for (const re of TIER_2_SLUR_PATTERNS) {
    const m = text.match(re)
    if (m) return { tier: 2, category: 'slur', match: m[0].slice(0, 40) }
  }

  // ── TIER 3 ──────────────────────────────────────────────────────────────
  for (const { word, regex } of TIER_3_REGEXES) {
    regex.lastIndex = 0
    if (regex.test(text)) return { tier: 3, category: 'profanity', match: word }
  }

  return null
}

/**
 * Classify text content into the highest-severity tier that matches.
 * Returns null if the text is clean.
 *
 * Runs the classifier twice: once against the original text, once against a
 * leet-normalized copy. This catches trivial evasion like "puter0" (→ putero)
 * or "h1j0 d3 p3rr4" while still preferring matches on the original string
 * (so the stored `match` shows what the user actually typed when possible).
 */
export function classifyContent(text: string): ClassificationResult | null {
  const raw = classifyOne(text)
  if (raw) return raw
  const normalized = normalizeLeet(text)
  if (normalized === text) return null
  return classifyOne(normalized)
}

/**
 * Filter TIER_3 profanity (asterisk replacement). TIER_1 / TIER_2 content
 * never gets to this function because the pipeline blocks it earlier.
 * Kept for belt-and-braces use after all tier checks.
 */
export function filterTier3(text: string): string {
  let filtered = text
  const sorted = [...TIER_3_REGEXES].sort(
    (a, b) => b.replacement.length - a.replacement.length
  )
  for (const { regex, replacement } of sorted) {
    filtered = filtered.replace(regex, replacement)
  }
  return filtered
}

/**
 * Convenience: does the text trip ANY tier? Used by /api/user/save-profile
 * where we don't need the tier, just a boolean "is this name clean?".
 */
export function isContentFlagged(text: string): boolean {
  return classifyContent(text) !== null
}
