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
      amnesty_declarations: {
        Row: {
          alt_nickname_raw: string
          alt_user_id: string | null
          created_at: string
          id: string
          main_user_id: string
        }
        Insert: {
          alt_nickname_raw: string
          alt_user_id?: string | null
          created_at?: string
          id?: string
          main_user_id: string
        }
        Update: {
          alt_nickname_raw?: string
          alt_user_id?: string | null
          created_at?: string
          id?: string
          main_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amnesty_declarations_alt_user_id_fkey"
            columns: ["alt_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amnesty_declarations_main_user_id_fkey"
            columns: ["main_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          current_game: string | null
          game_week_id: string
          has_password: boolean | null
          id: string
          max_players: number | null
          name: string
          owner_id: string
          password: string | null
        }
        Insert: {
          aura_bet?: number
          created_at?: string
          current_game?: string | null
          game_week_id: string
          has_password?: boolean | null
          id?: string
          max_players?: number | null
          name: string
          owner_id: string
          password?: string | null
        }
        Update: {
          aura_bet?: number
          created_at?: string
          current_game?: string | null
          game_week_id?: string
          has_password?: boolean | null
          id?: string
          max_players?: number | null
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
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        Insert: {
          amnesty_acknowledged?: boolean
          amnesty_main_id?: string | null
          aura_balance?: number
          bunker_pending?: boolean
          created_at?: string
          current_rank?: number
          equipped_title_id?: string | null
          free_suitcases?: number
          gray_aura?: number
          id: string
          is_amnesty_alt?: boolean
          last_daily_ticket_at?: string | null
          last_special_ticket_at?: string | null
          nickname?: string | null
          rank_before_gray?: number | null
          test_mode?: boolean
          test_mode_saved_balance?: number | null
          title_position?: string
        }
        Update: {
          amnesty_acknowledged?: boolean
          amnesty_main_id?: string | null
          aura_balance?: number
          bunker_pending?: boolean
          created_at?: string
          current_rank?: number
          equipped_title_id?: string | null
          free_suitcases?: number
          gray_aura?: number
          id?: string
          is_amnesty_alt?: boolean
          last_daily_ticket_at?: string | null
          last_special_ticket_at?: string | null
          nickname?: string | null
          rank_before_gray?: number | null
          test_mode?: boolean
          test_mode_saved_balance?: number | null
          title_position?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_amnesty_main_id_fkey"
            columns: ["amnesty_main_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_equipped_title_id_fkey"
            columns: ["equipped_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
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
          kind: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          game_week_id: string
          id?: string
          kind?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          game_week_id?: string
          id?: string
          kind?: string
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
      titles: {
        Row: {
          buyable: boolean
          cost: number | null
          created_at: string
          id: string
          is_glitch: boolean
          text: string
          tier: string
          unlock_condition: string | null
        }
        Insert: {
          buyable?: boolean
          cost?: number | null
          created_at?: string
          id?: string
          is_glitch?: boolean
          text: string
          tier: string
          unlock_condition?: string | null
        }
        Update: {
          buyable?: boolean
          cost?: number | null
          created_at?: string
          id?: string
          is_glitch?: boolean
          text?: string
          tier?: string
          unlock_condition?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_received: number
          amount_sent: number
          created_at: string
          id: string
          message: string | null
          receiver_id: string
          reversed_at: string | null
          reversed_by: string | null
          sender_id: string
        }
        Insert: {
          amount_received: number
          amount_sent: number
          created_at?: string
          id?: string
          message?: string | null
          receiver_id: string
          reversed_at?: string | null
          reversed_by?: string | null
          sender_id: string
        }
        Update: {
          amount_received?: number
          amount_sent?: number
          created_at?: string
          id?: string
          message?: string | null
          receiver_id?: string
          reversed_at?: string | null
          reversed_by?: string | null
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
      user_titles: {
        Row: {
          acquired_at: string
          bought_with_gray: boolean
          id: string
          title_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          bought_with_gray?: boolean
          id?: string
          title_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          bought_with_gray?: boolean
          id?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_titles_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
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
      _user_active_party: { Args: { p_uid: string }; Returns: string }
      abandon_party: { Args: never; Returns: undefined }
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
      amnesty_process: { Args: never; Returns: Json }
      auraguard_email_scan: { Args: never; Returns: Json }
      burn_aura: {
        Args: { p_keep: number }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buy_ticket: { Args: { p_kind: string }; Returns: undefined }
      claim_tickets: { Args: never; Returns: Json }
      create_party:
        | {
            Args: { p_aura_bet: number; p_name: string; p_password?: string }
            Returns: {
              aura_bet: number
              created_at: string
              current_game: string | null
              game_week_id: string
              has_password: boolean | null
              id: string
              max_players: number | null
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
        | {
            Args: {
              p_aura_bet: number
              p_max_players?: number
              p_name: string
              p_password?: string
            }
            Returns: {
              aura_bet: number
              created_at: string
              current_game: string | null
              game_week_id: string
              has_password: boolean | null
              id: string
              max_players: number | null
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
      declare_amnesty: {
        Args: { p_alts: string[] }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_account: { Args: never; Returns: undefined }
      denounce_comrade: {
        Args: { p_amount: number; p_reason?: string; p_recipient: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      destroy_all_parties: { Args: never; Returns: undefined }
      destroy_party: { Args: { p_party_id: string }; Returns: undefined }
      ensure_tickets: { Args: never; Returns: undefined }
      enter_bunker: { Args: never; Returns: Json }
      equip_title: {
        Args: { p_position: string; p_title_id: string }
        Returns: undefined
      }
      evacuate_all_parties: { Args: never; Returns: undefined }
      finalize_assembly: {
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
      fire_staff: {
        Args: {
          p_role: Database["public"]["Enums"]["staff_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      full_reset: { Args: never; Returns: undefined }
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
      grant_aura: {
        Args: { p_amount: number; p_nickname: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      grant_gray_aura: {
        Args: { p_amount: number; p_nickname: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      grant_title: {
        Args: { p_nickname: string; p_title_id: string }
        Returns: undefined
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
      kick_all_members: { Args: { p_party_id: string }; Returns: undefined }
      kick_member: {
        Args: { p_party_id: string; p_user_id: string }
        Returns: undefined
      }
      leave_party: { Args: { p_party_id: string }; Returns: undefined }
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
      my_private_profile: { Args: never; Returns: Json }
      my_quota: { Args: never; Returns: Json }
      my_staff_salary: { Args: never; Returns: number }
      open_suitcase: { Args: never; Returns: Json }
      owner_rank_up: {
        Args: { p_nickname: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purchase_rank_gray: {
        Args: never
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purchase_title: { Args: { p_title_id: string }; Returns: undefined }
      purchase_title_gray: { Args: { p_title_id: string }; Returns: undefined }
      report_comrade: {
        Args: { p_amount: number; p_reason?: string; p_recipient: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_all_aura: { Args: never; Returns: undefined }
      reset_all_gray_aura: { Args: never; Returns: undefined }
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
      revoke_title: {
        Args: { p_nickname: string; p_title_id: string }
        Returns: undefined
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
      sell_title: { Args: { p_title_id: string }; Returns: number }
      send_aura: {
        Args: { p_amount: number; p_message?: string; p_recipient: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
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
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
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
      set_test_mode: {
        Args: { p_enabled: boolean; p_nickname: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_aura: {
        Args: { p_amount: number; p_nickname: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_rank: {
        Args: { p_nickname: string; p_rank: number }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_checkin: { Args: never; Returns: Json }
      staff_punish: {
        Args: { p_amount: number; p_reason?: string; p_user_id: string }
        Returns: {
          amnesty_acknowledged: boolean
          amnesty_main_id: string | null
          aura_balance: number
          bunker_pending: boolean
          created_at: string
          current_rank: number
          equipped_title_id: string | null
          free_suitcases: number
          gray_aura: number
          id: string
          is_amnesty_alt: boolean
          last_daily_ticket_at: string | null
          last_special_ticket_at: string | null
          nickname: string | null
          rank_before_gray: number | null
          test_mode: boolean
          test_mode_saved_balance: number | null
          title_position: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_reverse_transfer: { Args: { p_tx_id: string }; Returns: undefined }
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
      submit_assembly_clicks: {
        Args: { p_clicks: number; p_session_id: string }
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
      swap_party_game: {
        Args: { p_game_type: string; p_party_id: string }
        Returns: undefined
      }
      unequip_title: { Args: never; Returns: undefined }
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
