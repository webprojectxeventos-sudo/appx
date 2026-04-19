export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: 'attendee' | 'admin' | 'scanner' | 'super_admin' | 'group_admin' | 'promoter' | 'cloakroom'
          event_id: string | null
          organization_id: string | null
          gender: 'masculino' | 'femenino' | 'otro' | null
          full_name_locked: boolean
          profanity_strikes: number
          last_strike_at: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'attendee' | 'admin' | 'scanner' | 'super_admin' | 'group_admin' | 'promoter' | 'cloakroom'
          event_id?: string | null
          organization_id?: string | null
          gender?: 'masculino' | 'femenino' | 'otro' | null
          full_name_locked?: boolean
          profanity_strikes?: number
          last_strike_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'attendee' | 'admin' | 'scanner' | 'super_admin' | 'group_admin' | 'promoter' | 'cloakroom'
          event_id?: string | null
          organization_id?: string | null
          gender?: 'masculino' | 'femenino' | 'otro' | null
          full_name_locked?: boolean
          profanity_strikes?: number
          last_strike_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          title: string
          description: string | null
          date: string
          location: string | null
          cover_image_url: string | null
          event_code: string
          event_type: 'eso' | 'fiesta'
          latitude: number | null
          longitude: number | null
          organization_id: string | null
          venue_id: string | null
          group_name: string | null
          video_url: string | null
          chat_enabled: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          date: string
          location?: string | null
          cover_image_url?: string | null
          event_code: string
          event_type?: 'eso' | 'fiesta'
          latitude?: number | null
          longitude?: number | null
          organization_id?: string | null
          venue_id?: string | null
          group_name?: string | null
          video_url?: string | null
          chat_enabled?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          date?: string
          location?: string | null
          cover_image_url?: string | null
          event_code?: string
          event_type?: 'eso' | 'fiesta'
          latitude?: number | null
          longitude?: number | null
          organization_id?: string | null
          venue_id?: string | null
          group_name?: string | null
          video_url?: string | null
          chat_enabled?: boolean
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          id: string
          event_id: string | null
          venue_id: string | null
          photo_date: string | null
          url: string
          caption: string | null
          uploaded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id?: string | null
          venue_id?: string | null
          photo_date?: string | null
          url: string
          caption?: string | null
          uploaded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string | null
          venue_id?: string | null
          photo_date?: string | null
          url?: string
          caption?: string | null
          uploaded_by?: string
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          event_id: string | null
          venue_id: string | null
          is_general: boolean
          user_id: string
          content: string
          is_announcement: boolean
          is_pinned: boolean
          deleted_at: string | null
          deleted_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id?: string | null
          venue_id?: string | null
          is_general?: boolean
          user_id: string
          content: string
          is_announcement?: boolean
          is_pinned?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string | null
          venue_id?: string | null
          is_general?: boolean
          user_id?: string
          content?: string
          is_announcement?: boolean
          is_pinned?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      polls: {
        Row: {
          id: string
          event_id: string
          question: string
          is_active: boolean
          poll_type: 'survey' | 'drink_order'
          allow_multiple: boolean
          ends_at: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          question: string
          is_active?: boolean
          poll_type?: 'survey' | 'drink_order'
          allow_multiple?: boolean
          ends_at?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          question?: string
          is_active?: boolean
          poll_type?: 'survey' | 'drink_order'
          allow_multiple?: boolean
          ends_at?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          id: string
          poll_id: string
          option_text: string
          created_at: string
        }
        Insert: {
          id?: string
          poll_id: string
          option_text: string
          created_at?: string
        }
        Update: {
          id?: string
          poll_id?: string
          option_text?: string
          created_at?: string
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          id: string
          poll_id: string
          poll_option_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          poll_id: string
          poll_option_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          poll_id?: string
          poll_option_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          id: string
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
        Relationships: []
      }
      drink_orders: {
        Row: {
          id: string
          event_id: string
          user_id: string
          alcohol_choice: string | null
          soft_drink_choice: string
          allergies: string[]
          allergy_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          alcohol_choice?: string | null
          soft_drink_choice: string
          allergies?: string[]
          allergy_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          alcohol_choice?: string | null
          soft_drink_choice?: string
          allergies?: string[]
          allergy_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          id: string
          user_id: string
          event_id: string
          qr_code: string
          status: 'valid' | 'used' | 'cancelled'
          scanned_at: string | null
          scanned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_id: string
          qr_code: string
          status?: 'valid' | 'used' | 'cancelled'
          scanned_at?: string | null
          scanned_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_id?: string
          qr_code?: string
          status?: 'valid' | 'used' | 'cancelled'
          scanned_at?: string | null
          scanned_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      event_schedule: {
        Row: {
          id: string
          event_id: string
          title: string
          description: string | null
          start_time: string
          end_time: string | null
          icon: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          title: string
          description?: string | null
          start_time: string
          end_time?: string | null
          icon?: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          title?: string
          description?: string | null
          start_time?: string
          end_time?: string | null
          icon?: string
          created_at?: string
        }
        Relationships: []
      }
      playlist_songs: {
        Row: {
          id: string
          event_id: string
          title: string
          artist: string
          spotify_url: string | null
          added_by: string
          status: 'pending' | 'approved' | 'rejected' | 'playing' | 'next'
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          title: string
          artist: string
          spotify_url?: string | null
          added_by: string
          status?: 'pending' | 'approved' | 'rejected' | 'playing' | 'next'
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          title?: string
          artist?: string
          spotify_url?: string | null
          added_by?: string
          status?: 'pending' | 'approved' | 'rejected' | 'playing' | 'next'
          created_at?: string
        }
        Relationships: []
      }
      playlist_votes: {
        Row: {
          id: string
          song_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          song_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          song_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          id: string
          user_id: string
          event_id: string
          role: 'attendee' | 'admin' | 'scanner' | 'super_admin' | 'group_admin' | 'promoter' | 'cloakroom'
          is_active: boolean
          is_muted: boolean
          added_by: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_id: string
          role?: 'attendee' | 'admin' | 'scanner' | 'super_admin' | 'group_admin' | 'promoter' | 'cloakroom'
          is_active?: boolean
          is_muted?: boolean
          added_by?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_id?: string
          role?: 'attendee' | 'admin' | 'scanner' | 'super_admin' | 'group_admin' | 'promoter' | 'cloakroom'
          is_active?: boolean
          is_muted?: boolean
          added_by?: string | null
          joined_at?: string
        }
        Relationships: []
      }
      cloakroom_items: {
        Row: {
          id: string
          event_id: string
          user_id: string
          ticket_number: number
          amount: number
          status: 'stored' | 'returned'
          checked_in_at: string
          checked_in_by: string
          checked_out_at: string | null
          checked_out_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          ticket_number: number
          amount?: number
          status?: 'stored' | 'returned'
          checked_in_at?: string
          checked_in_by: string
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          ticket_number?: number
          amount?: number
          status?: 'stored' | 'returned'
          checked_in_at?: string
          checked_in_by?: string
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth_key: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth_key: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth_key?: string
          created_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          logo_url?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          id: string
          organization_id: string
          name: string
          address: string | null
          city: string | null
          latitude: number | null
          longitude: number | null
          capacity: number | null
          image_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          address?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          capacity?: number | null
          image_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          address?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          capacity?: number | null
          image_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          id: string
          event_id: string
          organization_id: string | null
          reported_by: string
          type: 'medical' | 'security' | 'logistics' | 'other'
          description: string
          status: 'open' | 'in_progress' | 'resolved' | 'dismissed'
          priority: 'low' | 'medium' | 'high' | 'critical'
          resolved_by: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          organization_id?: string | null
          reported_by: string
          type: 'medical' | 'security' | 'logistics' | 'other'
          description: string
          status?: 'open' | 'in_progress' | 'resolved' | 'dismissed'
          priority?: 'low' | 'medium' | 'high' | 'critical'
          resolved_by?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          organization_id?: string | null
          reported_by?: string
          type?: 'medical' | 'security' | 'logistics' | 'other'
          description?: string
          status?: 'open' | 'in_progress' | 'resolved' | 'dismissed'
          priority?: 'low' | 'medium' | 'high' | 'critical'
          resolved_by?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          id: string
          organization_id: string | null
          title: string
          content: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          title: string
          content: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          title?: string
          content?: string
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      broadcast_log: {
        Row: {
          id: string
          organization_id: string | null
          event_ids: string[]
          content: string
          sent_by: string
          sent_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          event_ids: string[]
          content: string
          sent_by: string
          sent_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          event_ids?: string[]
          content?: string
          sent_by?: string
          sent_at?: string
        }
        Relationships: []
      }
      lost_found: {
        Row: {
          id: string
          event_id: string
          user_id: string
          description: string
          location_hint: string | null
          contact_info: string | null
          status: 'lost' | 'found'
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          description: string
          location_hint?: string | null
          contact_info?: string | null
          status?: 'lost' | 'found'
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          description?: string
          location_hint?: string | null
          contact_info?: string | null
          status?: 'lost' | 'found'
          created_at?: string
        }
        Relationships: []
      }
      access_codes: {
        Row: {
          id: string
          event_id: string
          code: string
          label: string | null
          is_active: boolean
          used_by: string | null
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          code: string
          label?: string | null
          is_active?: boolean
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          code?: string
          label?: string | null
          is_active?: boolean
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      chat_bans: {
        Row: {
          id: string
          user_id: string
          event_id: string
          banned_by: string
          reason: string | null
          banned_at: string
          expires_at: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          event_id: string
          banned_by: string
          reason?: string | null
          banned_at?: string
          expires_at?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          event_id?: string
          banned_by?: string
          reason?: string | null
          banned_at?: string
          expires_at?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      user_ig_unlocks: {
        Row: {
          user_id: string
          unlocked_at: string
        }
        Insert: {
          user_id: string
          unlocked_at?: string
        }
        Update: {
          user_id?: string
          unlocked_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      validate_access_code: {
        Args: { code_text: string }
        Returns: { event_id: string; code_id: string; event_title: string } | null
      }
      generate_access_codes: {
        Args: { target_event_id: string; quantity: number; code_label?: string }
        Returns: number
      }
      scan_ticket: {
        Args: { ticket_qr: string }
        Returns: { success: boolean; error?: string; user_name?: string; user_email?: string; event_title?: string; ticket_id?: string; scanned_at?: string }
      }
      generate_ticket: {
        Args: { p_user_id: string; p_event_id: string }
        Returns: string
      }
      get_user_visible_events: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      check_existing_user: {
        Args: { p_email: string }
        Returns: { exists: boolean }
      }
      assign_user_to_event: {
        Args: { p_user_id: string; p_event_id: string; p_added_by: string | null }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
