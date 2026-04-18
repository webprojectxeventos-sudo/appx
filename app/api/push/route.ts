import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

// Initialize web-push with VAPID keys
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@projectx.com'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)
} else {
  // Loud boot-time warning — silent VAPID misconfig is the worst failure mode
  // for moderation: admins never get alerted when a chat auto-disables.
  console.warn(
    '[push] VAPID keys missing — all push notifications will silently fail. ' +
      'Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel env.',
  )
}

// Create Supabase client with service role for querying subscriptions.
// Hard-fail if the service key is missing — the silent anon-key fallback
// caused moderation push notifications to die quietly (RLS blocked the
// cross-user subscription reads needed to broadcast) instead of surfacing
// the misconfig. Better to 503 and alert than lose moderation events.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Push API misconfigured: SUPABASE_SERVICE_ROLE_KEY missing')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Create Supabase client with user's auth token to verify admin role
function getSupabaseUser(authHeader: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  return client
}

interface PushRequest {
  title: string
  body: string
  url?: string
  event_ids?: string[]
  venue_id?: string
  send_to_all?: boolean
}

export async function POST(request: NextRequest) {
  try {
    // Verify VAPID keys are configured
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return NextResponse.json(
        { error: 'Push notifications not configured (missing VAPID keys)' },
        { status: 503 }
      )
    }

    // Verify caller is authenticated admin
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUser = getSupabaseUser(authHeader)
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabaseUser
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 })
    }

    const body: PushRequest = await request.json()
    if (!body.title || !body.body) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
    }

    // Validate UUID formats
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (body.event_ids?.some(id => !uuidRegex.test(id))) {
      return NextResponse.json({ error: 'Invalid event_id format' }, { status: 400 })
    }
    if (body.venue_id && !uuidRegex.test(body.venue_id)) {
      return NextResponse.json({ error: 'Invalid venue_id format' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Build query for push subscriptions based on segmentation
    let userIds: string[] = []

    if (body.send_to_all && profile.organization_id) {
      // All users in org
      const { data } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('organization_id', profile.organization_id)
      userIds = data?.map(u => u.id) || []
    } else if (body.venue_id) {
      // All users in events belonging to this venue
      const { data: events } = await supabaseAdmin
        .from('events')
        .select('id')
        .eq('venue_id', body.venue_id)
      const eventIds = events?.map(e => e.id) || []
      if (eventIds.length > 0) {
        const { data } = await supabaseAdmin
          .from('user_events')
          .select('user_id')
          .in('event_id', eventIds)
          .eq('is_active', true)
        userIds = [...new Set(data?.map(u => u.user_id) || [])]
      }
    } else if (body.event_ids && body.event_ids.length > 0) {
      // Users in specific events
      const { data } = await supabaseAdmin
        .from('user_events')
        .select('user_id')
        .in('event_id', body.event_ids)
        .eq('is_active', true)
      userIds = [...new Set(data?.map(u => u.user_id) || [])]
    }

    if (userIds.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, message: 'No target users found' })
    }

    // Get push subscriptions for these users
    const { data: subscriptions } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .in('user_id', userIds)

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, message: 'No push subscriptions found' })
    }

    // Send push notifications
    const payload = JSON.stringify({
      title: body.title,
      body: body.body,
      url: body.url || '/home',
      tag: `push-${Date.now()}`,
    })

    let sent = 0
    let failed = 0
    const expiredEndpoints: string[] = []

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth_key,
              },
            },
            payload
          )
          sent++
        } catch (err: unknown) {
          failed++
          // Clean up expired/invalid subscriptions
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            expiredEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    // Remove expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints)
    }

    return NextResponse.json({
      sent,
      failed,
      expired_cleaned: expiredEndpoints.length,
      total_subscriptions: subscriptions.length,
    })
  } catch (err) {
    console.error('[Push API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
