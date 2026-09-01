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
      ad_performance_daily: {
        Row: {
          ad_id: string
          ad_name: string
          adset_id: string
          adset_name: string
          campaign_id: string
          campaign_name: string
          clicks: number
          conversions: number
          created_at: string
          daily_budget: number
          date: string
          id: string
          impressions: number
          reach: number
          revenue: number
          spend: number
        }
        Insert: {
          ad_id: string
          ad_name: string
          adset_id: string
          adset_name: string
          campaign_id: string
          campaign_name: string
          clicks?: number
          conversions?: number
          created_at?: string
          daily_budget?: number
          date: string
          id?: string
          impressions?: number
          reach?: number
          revenue?: number
          spend?: number
        }
        Update: {
          ad_id?: string
          ad_name?: string
          adset_id?: string
          adset_name?: string
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          conversions?: number
          created_at?: string
          daily_budget?: number
          date?: string
          id?: string
          impressions?: number
          reach?: number
          revenue?: number
          spend?: number
        }
        Relationships: []
      }
      analysis_runs: {
        Row: {
          ai_status: string
          created_at: string
          findings_count: number
          id: string
          provider: string
          summary: string | null
          total_spend: number
          window_end: string
          window_start: string
        }
        Insert: {
          ai_status?: string
          created_at?: string
          findings_count?: number
          id?: string
          provider?: string
          summary?: string | null
          total_spend?: number
          window_end: string
          window_start: string
        }
        Update: {
          ai_status?: string
          created_at?: string
          findings_count?: number
          id?: string
          provider?: string
          summary?: string | null
          total_spend?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      findings: {
        Row: {
          ai_confidence: string | null
          ai_confidence_reason: string | null
          ai_explanation: string | null
          ai_recommended_action: string | null
          code: string
          created_at: string
          entity_id: string
          entity_level: string
          entity_name: string
          evidence: Json
          id: string
          metric: string
          run_id: string
          severity: string
          severity_score: number
          title: string
          what_changed: string
          why_it_matters: string
        }
        Insert: {
          ai_confidence?: string | null
          ai_confidence_reason?: string | null
          ai_explanation?: string | null
          ai_recommended_action?: string | null
          code: string
          created_at?: string
          entity_id: string
          entity_level: string
          entity_name: string
          evidence?: Json
          id?: string
          metric: string
          run_id: string
          severity: string
          severity_score?: number
          title: string
          what_changed: string
          why_it_matters: string
        }
        Update: {
          ai_confidence?: string | null
          ai_confidence_reason?: string | null
          ai_explanation?: string | null
          ai_recommended_action?: string | null
          code?: string
          created_at?: string
          entity_id?: string
          entity_level?: string
          entity_name?: string
          evidence?: Json
          id?: string
          metric?: string
          run_id?: string
          severity?: string
          severity_score?: number
          title?: string
          what_changed?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
