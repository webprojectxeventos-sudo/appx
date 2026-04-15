import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

// POST /api/user/delete-account — self-service account deletion.
//
// Deletes the caller's own account and all associated data:
//   - tickets (their ticket rows)
//   - messages (their chat messages)
//   - photos (their uploaded photos)
//   - poll_votes, survey_responses, drink_orders, lost_and_found_items
//   - push_subscriptions
//   - user_events (memberships)
//   - avatar file in storage
//   - row in public.users
//   - auth.users entry (the supabase auth record)
//
// This route is the in-app equivalent of the admin delete-user route. It
// uses service role to bypass RLS after verifying the caller's identity
// via their JWT.

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

    const sb = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Safety: refuse to delete super_admin via this endpoint (they should
    // use the admin route or contact support — we don't want a reviewer
    // accidentally nuking the demo account for everyone).
    const { data: profile } = await sb
      .from('users')
      .select('role, avatar_url')
      .eq('id', callerId)
      .single()

    if (profile?.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Los super administradores deben contactar al soporte para eliminar su cuenta' },
        { status: 403 },
      )
    }

    // Delete associated data in dependency order. Most tables either
    // reference users(id) with ON DELETE CASCADE or need manual cleanup.
    // We hit them defensively — missing tables are ignored.
    const userRelatedTables = [
      'push_subscriptions',
      'tickets',
      'messages',
      'photos',
      'poll_votes',
      'survey_responses',
      'drink_orders',
      'lost_and_found_items',
      'incidents',
      'chat_bans',
      'user_events',
    ]

    for (const table of userRelatedTables) {
      // Best-effort delete. If the table doesn't exist or the column name
      // differs, we silently skip — the goal is to remove whatever user
      // data we have, not to block deletion on schema mismatches.
      await sb.from(table).delete().eq('user_id', callerId).then(
        () => undefined,
        () => undefined,
      )
    }

    // Delete avatar file from storage if present
    if (profile?.avatar_url) {
      try {
        const match = profile.avatar_url.match(/\/avatars\/([^?]+)/)
        const filePath = match?.[1]
        if (filePath) {
          await sb.storage.from('avatars').remove([filePath])
        }
      } catch {
        // ignore — not fatal
      }
    }

    // Delete row in public.users
    await sb.from('users').delete().eq('id', callerId)

    // Finally delete the auth.users record. This invalidates all tokens
    // and frees the email for re-registration.
    const { error: authErr } = await sb.auth.admin.deleteUser(callerId)
    if (authErr) {
      console.error('[delete-account] auth delete error:', authErr.message)
      return NextResponse.json(
        { error: 'No se pudo eliminar la cuenta: ' + authErr.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[delete-account] unexpected error:', err)
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
