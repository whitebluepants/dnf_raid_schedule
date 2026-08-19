export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type InsertShape<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;
type UpdateShape<Row> = Partial<Row>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["profiles"]["Row"],
          "created_at" | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          invite_code_digest: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["groups"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["groups"]["Row"]>;
        Relationships: [];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          profile_id: string;
          role: Database["public"]["Enums"]["member_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["group_members"]["Row"],
          "id" | "role" | "created_at" | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["group_members"]["Row"]>;
        Relationships: [];
      };
      game_accounts: {
        Row: {
          id: string;
          profile_id: string;
          name: string;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["game_accounts"]["Row"],
          "id" | "is_archived" | "created_at" | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["game_accounts"]["Row"]>;
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          game_account_id: string;
          profile_id: string;
          name: string;
          class_name: string;
          role: Database["public"]["Enums"]["character_role"];
          fame: number;
          strength_tier: Database["public"]["Enums"]["strength_tier"];
          simulated_damage: number | null;
          buffer_power: number | null;
          notes: string | null;
          is_archived: boolean;
          data_updated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["characters"]["Row"],
          | "id"
          | "simulated_damage"
          | "buffer_power"
          | "notes"
          | "is_archived"
          | "data_updated_at"
          | "created_at"
          | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["characters"]["Row"]>;
        Relationships: [];
      };
      difficulty_presets: {
        Row: {
          id: string;
          group_id: string | null;
          code: Database["public"]["Enums"]["difficulty_code"];
          name: string;
          minimum_fame: number | null;
          red_dealer_fame: number | null;
          yellow_dealer_fame: number | null;
          green_dealer_fame: number | null;
          red_buffer_power: number | null;
          yellow_buffer_power: number | null;
          green_buffer_power: number | null;
          simulated_damage_reference: number | null;
          auto_assignment_enabled: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["difficulty_presets"]["Row"],
          | "id"
          | "group_id"
          | "minimum_fame"
          | "red_dealer_fame"
          | "yellow_dealer_fame"
          | "green_dealer_fame"
          | "red_buffer_power"
          | "yellow_buffer_power"
          | "green_buffer_power"
          | "simulated_damage_reference"
          | "auto_assignment_enabled"
          | "created_by"
          | "created_at"
          | "updated_at"
        >;
        Update: UpdateShape<
          Database["public"]["Tables"]["difficulty_presets"]["Row"]
        >;
        Relationships: [];
      };
      raid_events: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          game_week: string;
          event_date: string;
          status: Database["public"]["Enums"]["event_state"];
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["raid_events"]["Row"],
          "id" | "status" | "created_at" | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["raid_events"]["Row"]>;
        Relationships: [];
      };
      raid_waves: {
        Row: {
          id: string;
          raid_event_id: string;
          wave_number: number;
          difficulty: Database["public"]["Enums"]["difficulty_code"];
          status: Database["public"]["Enums"]["event_state"];
          version: number;
          is_locked: boolean;
          red_team_locked: boolean;
          yellow_team_locked: boolean;
          green_team_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["raid_waves"]["Row"],
          | "id"
          | "status"
          | "version"
          | "is_locked"
          | "red_team_locked"
          | "yellow_team_locked"
          | "green_team_locked"
          | "created_at"
          | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["raid_waves"]["Row"]>;
        Relationships: [];
      };
      event_registrations: {
        Row: {
          id: string;
          raid_event_id: string;
          profile_id: string;
          state: Database["public"]["Enums"]["registration_state"];
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["event_registrations"]["Row"],
          "id" | "state" | "version" | "created_at" | "updated_at"
        >;
        Update: UpdateShape<
          Database["public"]["Tables"]["event_registrations"]["Row"]
        >;
        Relationships: [];
      };
      event_character_registrations: {
        Row: {
          id: string;
          raid_event_id: string;
          profile_id: string;
          character_id: string;
          created_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["event_character_registrations"]["Row"],
          "id" | "created_at"
        >;
        Update: UpdateShape<
          Database["public"]["Tables"]["event_character_registrations"]["Row"]
        >;
        Relationships: [];
      };
      schedule_slots: {
        Row: {
          id: string;
          raid_wave_id: string;
          team_color: Database["public"]["Enums"]["team_color"];
          slot_index: number;
          slot_role: Database["public"]["Enums"]["character_role"];
          assigned_character_id: string | null;
          assigned_game_account_id: string | null;
          assigned_profile_id: string | null;
          is_locked: boolean;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["schedule_slots"]["Row"],
          | "id"
          | "assigned_character_id"
          | "assigned_game_account_id"
          | "assigned_profile_id"
          | "is_locked"
          | "version"
          | "created_at"
          | "updated_at"
        >;
        Update: UpdateShape<Database["public"]["Tables"]["schedule_slots"]["Row"]>;
        Relationships: [];
      };
      character_weekly_usage: {
        Row: {
          id: string;
          game_week: string;
          character_id: string;
          raid_event_id: string;
          raid_wave_id: string;
          state: Database["public"]["Enums"]["usage_state"];
          reserved_by: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["character_weekly_usage"]["Row"],
          "id" | "state" | "completed_at" | "created_at"
        >;
        Update: UpdateShape<
          Database["public"]["Tables"]["character_weekly_usage"]["Row"]
        >;
        Relationships: [];
      };
      schedule_revisions: {
        Row: {
          id: string;
          raid_event_id: string;
          raid_wave_id: string | null;
          action: Database["public"]["Enums"]["revision_action"];
          actor_profile_id: string;
          expected_version: number | null;
          resulting_version: number | null;
          before_state: Json;
          after_state: Json;
          created_at: string;
        };
        Insert: InsertShape<
          Database["public"]["Tables"]["schedule_revisions"]["Row"],
          | "id"
          | "raid_wave_id"
          | "expected_version"
          | "resulting_version"
          | "before_state"
          | "after_state"
          | "created_at"
        >;
        Update: UpdateShape<
          Database["public"]["Tables"]["schedule_revisions"]["Row"]
        >;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_profile_id: { Args: Record<PropertyKey, never>; Returns: string };
      is_group_member: { Args: { target_group_id: string }; Returns: boolean };
      has_group_role: {
        Args: {
          target_group_id: string;
          roles: Database["public"]["Enums"]["member_role"][];
        };
        Returns: boolean;
      };
    };
    Enums: {
      member_role: "member" | "leader" | "admin";
      character_role: "dealer" | "buffer";
      strength_tier: "high" | "medium" | "low";
      event_state: "draft" | "open" | "published" | "completed" | "archived";
      registration_state: "participating" | "absent";
      difficulty_code: "normal" | "hard" | "judgment";
      team_color: "red" | "yellow" | "green";
      usage_state: "reserved" | "completed";
      revision_action:
        | "generate"
        | "move"
        | "swap"
        | "replace"
        | "mark_absent"
        | "publish"
        | "undo"
        | "redo"
        | "lock"
        | "unlock";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
