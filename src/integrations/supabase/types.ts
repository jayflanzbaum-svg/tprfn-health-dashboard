export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      hub_callsigns: {
        Row: {
          callsign: string
          created_at: string
          id: string
        }
        Insert: {
          callsign: string
          created_at?: string
          id?: string
        }
        Update: {
          callsign?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      hub_profiles: {
        Row: {
          base_callsign: string
          city: string | null
          country: string | null
          created_at: string
          frequencies: Json
          full_callsign: string
          id: string
          latitude: number | null
          longitude: number | null
          network: string | null
          notes: string | null
          operator: string | null
          ssid: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          base_callsign: string
          city?: string | null
          country?: string | null
          created_at?: string
          frequencies?: Json
          full_callsign: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          network?: string | null
          notes?: string | null
          operator?: string | null
          ssid?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          base_callsign?: string
          city?: string | null
          country?: string | null
          created_at?: string
          frequencies?: Json
          full_callsign?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          network?: string | null
          notes?: string | null
          operator?: string | null
          ssid?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      net_sessions: {
        Row: {
          created_at: string
          ended_at: string
          id: string
          name: string
          notes: string | null
          started_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at: string
          id?: string
          name?: string
          notes?: string | null
          started_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string
          id?: string
          name?: string
          notes?: string | null
          started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      station_locations: {
        Row: {
          address: string | null
          callsign: string
          city: string | null
          country: string | null
          created_at: string
          grid_square: string | null
          id: string
          is_manual_override: boolean
          is_paused: boolean
          last_fetched_at: string | null
          latitude: number | null
          longitude: number | null
          paused_at: string | null
          resume_at: string | null
          source: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          callsign: string
          city?: string | null
          country?: string | null
          created_at?: string
          grid_square?: string | null
          id?: string
          is_manual_override?: boolean
          is_paused?: boolean
          last_fetched_at?: string | null
          latitude?: number | null
          longitude?: number | null
          paused_at?: string | null
          resume_at?: string | null
          source?: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          callsign?: string
          city?: string | null
          country?: string | null
          created_at?: string
          grid_square?: string | null
          id?: string
          is_manual_override?: boolean
          is_paused?: boolean
          last_fetched_at?: string | null
          latitude?: number | null
          longitude?: number | null
          paused_at?: string | null
          resume_at?: string | null
          source?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      support_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          request_type: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          request_type: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          request_type?: string
        }
        Relationships: []
      }
      syslog_entries: {
        Row: {
          bandwidth: number | null
          bitrate: number | null
          bytes_received: number | null
          bytes_sent: number | null
          callsign: string
          created_at: string | null
          duration_seconds: number | null
          event_type: string
          frequency: number | null
          hub: string
          id: string
          raw_message: string
          remote_callsign: string | null
          snr: number | null
          timestamp: string
          total_bytes: number | null
        }
        Insert: {
          bandwidth?: number | null
          bitrate?: number | null
          bytes_received?: number | null
          bytes_sent?: number | null
          callsign: string
          created_at?: string | null
          duration_seconds?: number | null
          event_type: string
          frequency?: number | null
          hub: string
          id?: string
          raw_message: string
          remote_callsign?: string | null
          snr?: number | null
          timestamp: string
          total_bytes?: number | null
        }
        Update: {
          bandwidth?: number | null
          bitrate?: number | null
          bytes_received?: number | null
          bytes_sent?: number | null
          callsign?: string
          created_at?: string | null
          duration_seconds?: number | null
          event_type?: string
          frequency?: number | null
          hub?: string
          id?: string
          raw_message?: string
          remote_callsign?: string | null
          snr?: number | null
          timestamp?: string
          total_bytes?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      distinct_syslog_callsigns: {
        Args: never
        Returns: {
          callsign: string
        }[]
      }
      hub_uptime_days: {
        Args: { p_end: string; p_hubs: string[]; p_start: string }
        Returns: {
          callsign: string
          days: number
          last_seen: string
        }[]
      }
      syslog_kpis: {
        Args: {
          allowed_callsigns: string[]
          end_ts: string
          selected_station?: string
          start_ts: string
        }
        Returns: {
          avg_sn: number
          sessions: number
          sn_readings: number
          success_rate: number
          total_data: number
        }[]
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
