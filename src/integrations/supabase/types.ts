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
      aura_bank: {
        Row: {
          balance: number
          id: number
          updated_at: string
        }
        Insert: {
          balance?: number
          id?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      bans: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          issued_by: string
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_by: string
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_by?: string
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bans_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          current_rank: number
          id: string
          nickname: string | null
        }
        Insert: {
          aura_balance?: number
          created_at?: string
          current_rank?: number
          id: string
          nickname?: string | null
        }
        Update: {
          aura_balance?: number
          created_at?: string
          current_rank?: number
          id?: string
          nickname?: string | null
        }
        Relationships: []
      }
      ranks: {
        Row: {
          max_aura: number
          max_send: number
          multiplier: number
          name: string
          rank: number
          salary: number
          super_tickets: number
          tickets: number
          upgrade_cost: number
        }
        Insert: {
          max_aura: number
          max_send: number
          multiplier: number
          name: string
          rank: number
          salary: number
          super_tickets: number
          tickets: number
          upgrade_cost: number
        }
        Update: {
          max_aura?: number
          max_send?: number
          multiplier?: number
          name?: string
          rank?: number
          salary?: number
          super_tickets?: number
          tickets?: number
          upgrade_cost?: number
        }
        Relationships: []
      }
      report_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          notes: string | null
          report_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          notes?: string | null
          report_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          payload: Json
          priority: number
          queue: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_user_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          priority?: number
          queue: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_user_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          priority?: number
          queue?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_user_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_checkins: {
        Row: {
          created_at: string
          day: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          hired_at: string
          hired_by: string | null
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          weekly_salary: number
        }
        Insert: {
          hired_at?: string
          hired_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          weekly_salary?: number
        }
        Update: {
          hired_at?: string
          hired_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
          weekly_salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_roles_hired_by_fkey"
            columns: ["hired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_warnings: {
        Row: {
          created_at: string
          id: string
          reason: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      act_on_report: {
        Args: {
          p_action: string
          p_amount?: number
          p_notes?: string
          p_report_id: string
        }
        Returns: {
          created_at: string
          id: string
          payload: Json
          priority: number
          queue: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_user_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      burn_aura: {
        Args: { p_keep: number }
        Returns: {
          aura_balance: number
          created_at: string
          current_rank: number
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
      delete_my_account: { Args: never; Returns: undefined }
      ensure_tickets: { Args: never; Returns: undefined }
      fire_staff: {
        Args: {
          p_role: Database["public"]["Enums"]["staff_role"]
          p_user_id: string
        }
        Returns: undefined
      }
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
      get_rank_info: {
        Args: { p_rank: number }
        Returns: {
          max_aura: number
          max_send: number
          multiplier: number
          name: string
          rank: number
          salary: number
          super_tickets: number
          tickets: number
          upgrade_cost: number
        }
        SetofOptions: {
          from: "*"
          to: "ranks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["staff_role"]
          _user_id: string
        }
        Returns: boolean
      }
      highest_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      hire_staff: {
        Args: {
          p_nickname: string
          p_role: Database["public"]["Enums"]["staff_role"]
          p_salary: number
        }
        Returns: {
          hired_at: string
          hired_by: string | null
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          weekly_salary: number
        }
        SetofOptions: {
          from: "*"
          to: "staff_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      issue_ban: {
        Args: { p_days?: number; p_reason: string; p_user_id: string }
        Returns: {
          created_at: string
          expires_at: string | null
          id: string
          issued_by: string
          reason: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bans"
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
      lift_ban: { Args: { p_ban_id: string }; Returns: undefined }
      list_staff_full: {
        Args: never
        Returns: {
          hired_at: string
          hired_by: string | null
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          weekly_salary: number
        }[]
        SetofOptions: {
          from: "*"
          to: "staff_roles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_quota: { Args: never; Returns: Json }
      promote_user: {
        Args: {
          p_role: Database["public"]["Enums"]["staff_role"]
          p_salary?: number
          p_user_id: string
        }
        Returns: {
          hired_at: string
          hired_by: string | null
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          weekly_salary: number
        }
        SetofOptions: {
          from: "*"
          to: "staff_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purchase_rank: {
        Args: never
        Returns: {
          aura_balance: number
          created_at: string
          current_rank: number
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
      report_comrade: {
        Args: { p_amount: number; p_reason?: string; p_recipient: string }
        Returns: {
          aura_balance: number
          created_at: string
          current_rank: number
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
      run_weekly_payroll: { Args: never; Returns: undefined }
      send_aura: {
        Args: { p_amount: number; p_message?: string; p_recipient: string }
        Returns: {
          aura_balance: number
          created_at: string
          current_rank: number
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
          current_rank: number
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
      set_owner_salary: {
        Args: { p_salary: number }
        Returns: {
          hired_at: string
          hired_by: string | null
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          weekly_salary: number
        }
        SetofOptions: {
          from: "*"
          to: "staff_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_checkin: { Args: never; Returns: Json }
      staff_punish: {
        Args: { p_amount: number; p_reason?: string; p_user_id: string }
        Returns: {
          aura_balance: number
          created_at: string
          current_rank: number
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
      submit_report: {
        Args: {
          p_extra?: Json
          p_message?: string
          p_target_nickname?: string
          p_type: string
        }
        Returns: {
          created_at: string
          id: string
          payload: Json
          priority: number
          queue: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_user_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      staff_role: "owner" | "admin" | "moderator"
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
    Enums: {
      staff_role: ["owner", "admin", "moderator"],
    },
  },
} as const
