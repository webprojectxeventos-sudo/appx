import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'
import { isContentFlagged } from '@/lib/content-classifier'

/**
 * Server-side profile save.
 *
 * The client no longer writes to public.users directly — the migration
 * REVOKEs UPDATE on full_name / full_name_locked from the authenticated role.
 * Everything funnels through here so we can enforce:
 *   - Name format (≥2 tokens, each ≥2 chars, alpha-only with accents)
 *   - No profanity in the displayed name
 *   - Once saved, the name is LOCKED (full_name_locked=true) — prevents
 *     the "send legit, rename to insult" attack.
 *
 * Admins retain the ability to update a user's name via other admin routes;
 * this endpoint is strictly for self-service.
 */

const NAME_MAX = 80

// Matches a name token: letters (with accents/ñ/diacritics), apostrophes and
// hyphens allowed inside the token. No digits, no symbols.
const NAME_TOKEN_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ'´’-]+$/

function validateName(raw: string): { ok: true; cleaned: string } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { ok: false, error: 'El nombre no puede estar vacio' }
  if (trimmed.length > NAME_MAX) return { ok: false, error: `Nombre demasiado largo (max ${NAME_MAX})` }

  const tokens = trimmed.split(' ')
  if (tokens.length < 2) {
    return { ok: false, error: 'Introduce nombre y apellido' }
  }
  for (const t of tokens) {
    if (t.length < 2) return { ok: false, error: 'Cada parte del nombre debe tener al menos 2 letras' }
    if (!NAME_TOKEN_RE.test(t)) {
      return { ok: false, error: 'El nombre solo puede contener letras' }
    }
  }

  // Same token repeated (e.g. "Juan Juan") — reject
  const lower = tokens.map((t) => t.toLowerCase())
  if (new Set(lower).size !== lower.length) {
    return { ok: false, error: 'No repitas partes del nombre' }
  }

  // Profanity check — uses the tiered classifier, which catches
  // classic swears, drug words, and any other flagged content.
  if (isContentFlagged(trimmed)) {
    return { ok: false, error: 'El nombre contiene lenguaje inapropiado' }
  }

  // Capitalize each token for display consistency (Juan Pérez, not juan pérez)
  const cleaned = tokens
    .map((t) => t[0].toUpperCase() + t.slice(1).toLowerCase())
    .join(' ')

  return { ok: true, cleaned }
}

export async function POST(request: NextRequest) {
  try {
    const callerId = getCallerId(request)
    if (!callerId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
    }

    const rawName = typeof body.full_name === 'string' ? body.full_name : ''
    const gender = typeof body.gender === 'string' ? body.gender : null
    const avatarUrl = typeof body.avatar_url === 'string' ? body.avatar_url : null

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Load current state — need to know if name is locked
    const { data: current } = await supabaseAdmin
      .from('users')
      .select('full_name, full_name_locked')
      .eq('id', callerId)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Build the update patch
    const patch: Record<string, unknown> = {}

    // Name handling
    if (rawName || current.full_name === null) {
      const v = validateName(rawName)
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 })
      }

      // If locked AND the name is actually changing → block
      if (current.full_name_locked && v.cleaned !== current.full_name) {
        return NextResponse.json(
          {
            error:
              'Tu nombre ya esta guardado y no se puede cambiar. Contacta con un organizador si necesitas corregirlo.',
          },
          { status: 423 },
        )
      }

      patch.full_name = v.cleaned
      patch.full_name_locked = true
    }

    // Gender (free-form — one of the three allowed enum values)
    if (gender === null || gender === '') {
      patch.gender = null
    } else if (['masculino', 'femenino', 'otro'].includes(gender)) {
      patch.gender = gender
    }

    // Avatar URL — accept only if it looks like a Supabase storage URL
    if (avatarUrl !== null) {
      if (avatarUrl === '' || avatarUrl.includes('/storage/v1/object/public/avatars/')) {
        patch.avatar_url = avatarUrl || null
      }
      // else: silently ignore — not going to error on a weird URL
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, unchanged: true })
    }

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update(patch)
      .eq('id', callerId)

    if (updateErr) {
      console.error('[save-profile] Update error:', updateErr.message)
      return NextResponse.json({ error: 'No se pudo guardar el perfil' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      full_name: patch.full_name ?? current.full_name,
      full_name_locked: patch.full_name_locked ?? current.full_name_locked,
    })
  } catch (err) {
    console.error('[save-profile] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
