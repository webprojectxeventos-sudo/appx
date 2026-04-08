-- ============================================================
-- Migration: QR Tickets system + Scanner role
-- ============================================================

-- 1. Update users.role enum to include 'scanner'
-- Since Supabase doesn't allow direct ALTER TYPE ADD VALUE in transactions easily,
-- we drop the constraint and recreate it.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('attendee', 'admin', 'scanner'));

-- 2. Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  qr_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled')),
  scanned_at TIMESTAMPTZ,
  scanned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- One ticket per user per event
  UNIQUE(user_id, event_id)
);

-- 3. Enable RLS
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Attendees can read their own ticket
CREATE POLICY "Users can view own tickets"
  ON tickets FOR SELECT
  USING (auth.uid() = user_id);

-- Scanners can read all tickets for their event
CREATE POLICY "Scanners can view event tickets"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('scanner', 'admin')
      AND users.event_id = tickets.event_id
    )
  );

-- Admins can do everything
CREATE POLICY "Admins full access to tickets"
  ON tickets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- System can insert tickets (via service role or authenticated users for their own)
CREATE POLICY "Users can create own ticket"
  ON tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Scanners can update ticket status (scan)
CREATE POLICY "Scanners can update tickets"
  ON tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('scanner', 'admin')
      AND users.event_id = tickets.event_id
    )
  );

-- 5. Function to scan a ticket (validates and marks as used)
CREATE OR REPLACE FUNCTION scan_ticket(ticket_qr TEXT)
RETURNS JSON AS $$
DECLARE
  v_ticket tickets%ROWTYPE;
  v_user users%ROWTYPE;
  v_event events%ROWTYPE;
  v_scanner_id UUID;
BEGIN
  v_scanner_id := auth.uid();

  -- Find the ticket
  SELECT * INTO v_ticket FROM tickets WHERE qr_code = ticket_qr;

  IF v_ticket IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ticket no encontrado');
  END IF;

  -- Check if already used
  IF v_ticket.status = 'used' THEN
    RETURN json_build_object('success', false, 'error', 'Ticket ya escaneado', 'scanned_at', v_ticket.scanned_at);
  END IF;

  -- Check if cancelled
  IF v_ticket.status = 'cancelled' THEN
    RETURN json_build_object('success', false, 'error', 'Ticket cancelado');
  END IF;

  -- Get user info
  SELECT * INTO v_user FROM users WHERE id = v_ticket.user_id;
  SELECT * INTO v_event FROM events WHERE id = v_ticket.event_id;

  -- Mark as used
  UPDATE tickets
  SET status = 'used', scanned_at = now(), scanned_by = v_scanner_id
  WHERE id = v_ticket.id;

  RETURN json_build_object(
    'success', true,
    'user_name', v_user.full_name,
    'user_email', v_user.email,
    'event_title', v_event.title,
    'ticket_id', v_ticket.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to generate QR code for a user (called after drink order)
CREATE OR REPLACE FUNCTION generate_ticket(p_user_id UUID, p_event_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_qr TEXT;
  v_existing TEXT;
BEGIN
  -- Check if ticket already exists
  SELECT qr_code INTO v_existing FROM tickets
  WHERE user_id = p_user_id AND event_id = p_event_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Generate unique QR code: PX-{event_id_short}-{random}
  v_qr := 'PX-' || substring(p_event_id::text, 1, 8) || '-' ||
           encode(gen_random_bytes(12), 'hex');

  INSERT INTO tickets (user_id, event_id, qr_code)
  VALUES (p_user_id, p_event_id, v_qr);

  RETURN v_qr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON tickets(qr_code);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(event_id, status);
