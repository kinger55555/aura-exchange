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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      game_sessions: {
        Row: {
          aura_quota: number
          created_at: string
          game_type: string
          id: string
          party_id: string
          result_data: Json | null
          state: Json
          status: string
        }
        Insert: {
          aura_quota?: number
          created_at?: string
          game_type: string
          id?: string
          party_id: string
          result_data?: Json | null
          state?: Json
          status?: string
        }
        Update: {
          aura_quota?: number
          created_at?: string
          game_type?: string
          id?: string
          party_id?: string
          result_data?: Json | null
          state?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      game_weeks: {
        Row: {
          created_at: string
          ends_at: string
          game_name: string
          game_type: string
          id: string
          starts_at: string
          week_label: string
        }
        Insert: {
          created_at?: string
          ends_at?: string
          game_name: string
          game_type: string
          id?: string
          starts_at?: string
          week_label: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          game_name?: string
          game_type?: string
          id?: string
          starts_at?: string
          week_label?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          aura_bet: number
          created_at: string
          game_week_id: string
          id: string
          name: string
          owner_id: string
          password: string | null
        }
        Insert: {
          aura_bet?: number
          created_at?: string
          game_week_id: string
          id?: string
          name: string
          owner_id: string
          password?: string | null
        }
        Update: {
          aura_bet?: number
          created_at?: string
          game_week_id?: string
          id?: string
          name?: string
          owner_id?: string
          password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_game_week_id_fkey"
            columns: ["game_week_id"]
            isOneToOne: false
            referencedRelation: "game_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_members: {
        Row: {
          id: string
          joined_at: string
          party_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          party_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          party_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aura_balance: number
          created_at: string
          id: string
          nickname: string | null
        }
        Insert: {
          aura_balance?: number
          created_at?: string
          id: string
          nickname?: string | null
        }
        Update: {
          aura_balance?: number
          created_at?: string
          id?: string
          nickname?: string | null
        }
        Relationships: []
      }
      tickets: {
        Row: {
          created_at: string
          game_week_id: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          game_week_id: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          game_week_id?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_game_week_id_fkey"
            columns: ["game_week_id"]
            isOneToOne: false
            referencedRelation: "game_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_received: number
          amount_sent: number
          created_at: string
          id: string
          message: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          amount_received: number
          amount_sent: number
          created_at?: string
          id?: string
          message?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          amount_received?: number
          amount_sent?: number
          created_at?: string
          id?: string
          message?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _rr_payout: {
        Args: {
          p_dissident: string
          p_exploded: string
          p_multiplier: number
          p_party: Database["public"]["Tables"]["parties"]["Row"]
          p_session: Database["public"]["Tables"]["game_sessions"]["Row"]
        }
        Returns: undefined
      }
      create_party: {
        Args: { p_aura_bet: number; p_name: string; p_password?: string }
        Returns: {
          aura_bet: number
          created_at: string
          game_week_id: string
          id: string
          name: string
          owner_id: string
          password: string | null
        }
        SetofOptions: {
          from: "*"
          to: "parties"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_tickets: { Args: never; Returns: undefined }
      get_or_create_game_week: {
        Args: never
        Returns: {
          created_at: string
          ends_at: string
          game_name: string
          game_type: string
          id: string
          starts_at: string
          week_label: string
        }
        SetofOptions: {
          from: "*"
          to: "game_weeks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_party: {
        Args: { p_party_id: string; p_password?: string }
        Returns: {
          id: string
          joined_at: string
          party_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "party_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_comrade: {
        Args: { p_amount: number; p_reason?: string; p_recipient: string }
        Returns: {
          aura_balance: number
          created_at: string
          id: string
          nickname: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_game: {
        Args: { p_result_data: Json; p_session_id: string; p_status: string }
        Returns: {
          aura_quota: number
          created_at: string
          game_type: string
          id: string
          party_id: string
          result_data: Json | null
          state: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "game_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rr_mark_afk: {
        Args: { p_session_id: string }
        Returns: {
          aura_quota: number
          created_at: string
          game_type: string
          id: string
          party_id: string
          result_data: Json | null
          state: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "game_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rr_press: {
        Args: { p_session_id: string }
        Returns: {
          aura_quota: number
          created_at: string
          game_type: string
          id: string
          party_id: string
          result_data: Json | null
          state: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "game_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rr_vote: {
        Args: { p_cash_out: boolean; p_session_id: string }
        Returns: {
          aura_quota: number
          created_at: string
          game_type: string
          id: string
          party_id: string
          result_data: Json | null
          state: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "game_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_aura: {
        Args: { p_amount: number; p_message?: string; p_recipient: string }
        Returns: {
          aura_balance: number
          created_at: string
          id: string
          nickname: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_nickname: {
        Args: { p_nickname: string }
        Returns: {
          aura_balance: number
          created_at: string
          id: string
          nickname: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_game_session: {
        Args: { p_party_id: string }
        Returns: {
          aura_quota: number
          created_at: string
          game_type: string
          id: string
          party_id: string
          result_data: Json | null
          state: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "game_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
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
