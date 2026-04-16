export type ScanResult = {
  success: boolean
  error?: string
  user_name?: string
  user_email?: string
  event_title?: string
  ticket_id?: string
  scanned_at?: string
}

export type AttendeeRow = {
  id: string
  user_id: string
  event_id: string
  qr_code: string
  status: 'valid' | 'used' | 'cancelled'
  scanned_at: string | null
  created_at: string
  user_name: string | null
  user_email: string
}

export type ScannerEvent = {
  id: string
  title: string
  group_name: string | null
  date: string
  venue_id: string | null
}

export type DayGroup = {
  key: string
  label: string
  events: ScannerEvent[]
}
