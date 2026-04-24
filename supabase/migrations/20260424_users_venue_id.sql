-- Migration: venue-scoped scanner/cloakroom assignment
-- Run this in Supabase SQL Editor.
--
-- Problem: scanners and cloakroom staff were previously bound to a venue
-- indirectly — via `user_events` rows that the admin had to recreate every
-- time a new event was published at that venue. If the admin forgot, the
-- scanner showed up at the door and saw zero events. If an event was
-- deleted, the scanner silently lost venue-wide access.
--
-- Fix: bind scanners directly to a venue via `users.venue_id`. Once set,
-- `lib/scanner-access.ts` resolves the caller's accessible events from the
-- venue itself, so a scanner permanently covers their venue regardless of
-- which events exist on any given day.
--
-- `user_events` rows remain honored as a layering mechanism (e.g. lend a
-- scanner to a one-off event at a different venue), but are no longer
-- required for the common case.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

-- Keeps scanner bootstrap fast: the access resolver does
--   select id from events where venue_id = $1 and date between $from and $to
-- on every scanner page load.
CREATE INDEX IF NOT EXISTS idx_users_venue_id
  ON users(venue_id)
  WHERE venue_id IS NOT NULL;

-- Lock writes to `venue_id` to service-role only. Without this, a scanner
-- who knows their JWT can `update users set venue_id = ...` and escalate to
-- a different venue's tickets. Admin UI uses the service role via /api/admin/*.
REVOKE UPDATE (venue_id) ON public.users FROM authenticated;
REVOKE UPDATE (venue_id) ON public.users FROM anon;
