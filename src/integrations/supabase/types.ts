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
      access_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          email: string | null
          event_type: string
          id: string
          ip: string | null
          metadata: Json
          reason: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          email?: string | null
          event_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          reason?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          email?: string | null
          event_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          reason?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      achievement_shares: {
        Row: {
          achievement: string
          action: string
          created_at: string
          format: string
          id: string
          is_official: boolean
          position: number | null
          reference_month: number
          reference_year: number
          subject_user_id: string | null
          template: string
          user_id: string
        }
        Insert: {
          achievement: string
          action: string
          created_at?: string
          format: string
          id?: string
          is_official?: boolean
          position?: number | null
          reference_month: number
          reference_year: number
          subject_user_id?: string | null
          template: string
          user_id: string
        }
        Update: {
          achievement?: string
          action?: string
          created_at?: string
          format?: string
          id?: string
          is_official?: boolean
          position?: number | null
          reference_month?: number
          reference_year?: number
          subject_user_id?: string | null
          template?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_assistant_configs: {
        Row: {
          assistant: Database["public"]["Enums"]["ai_assistant_kind"]
          enabled_modes: string[]
          extra_instructions: string
          is_active: boolean
          model: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assistant: Database["public"]["Enums"]["ai_assistant_kind"]
          enabled_modes?: string[]
          extra_instructions?: string
          is_active?: boolean
          model?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assistant?: Database["public"]["Enums"]["ai_assistant_kind"]
          enabled_modes?: string[]
          extra_instructions?: string
          is_active?: boolean
          model?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_assistant_settings: {
        Row: {
          course_information: string
          id: boolean
          instructions: string
          objection_rules: string
          pricing_rules: string
          prohibited_claims: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          course_information?: string
          id?: boolean
          instructions?: string
          objection_rules?: string
          pricing_rules?: string
          prohibited_claims?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          course_information?: string
          id?: boolean
          instructions?: string
          objection_rules?: string
          pricing_rules?: string
          prohibited_claims?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_campaigns: {
        Row: {
          allowed_phrases: string
          allowed_urgency: string
          approved_message: string
          conditions: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          forbidden_phrases: string
          id: string
          is_active: boolean
          name: string
          reason: string
          reference_month: string
          starts_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_phrases?: string
          allowed_urgency?: string
          approved_message?: string
          conditions?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          forbidden_phrases?: string
          id?: string
          is_active?: boolean
          name: string
          reason?: string
          reference_month?: string
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_phrases?: string
          allowed_urgency?: string
          approved_message?: string
          conditions?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          forbidden_phrases?: string
          id?: string
          is_active?: boolean
          name?: string
          reason?: string
          reference_month?: string
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_examples: {
        Row: {
          assistant: Database["public"]["Enums"]["ai_assistant_kind"]
          category: string
          commercial_risk: string
          context: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_approved: boolean
          lead_message: string
          objective: string
          reason: string
          recommended_fix: string
          related_rule: string
          response: string
          stage: string
          strategy: string
          tags: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assistant?: Database["public"]["Enums"]["ai_assistant_kind"]
          category?: string
          commercial_risk?: string
          context?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          lead_message?: string
          objective?: string
          reason?: string
          recommended_fix?: string
          related_rule?: string
          response?: string
          stage?: string
          strategy?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assistant?: Database["public"]["Enums"]["ai_assistant_kind"]
          category?: string
          commercial_risk?: string
          context?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          lead_message?: string
          objective?: string
          reason?: string
          recommended_fix?: string
          related_rule?: string
          response?: string
          stage?: string
          strategy?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_interactions: {
        Row: {
          assistant: Database["public"]["Enums"]["ai_assistant_kind"]
          attachments: Json
          copied_message: string | null
          created_at: string
          feedback: string | null
          feedback_comment: string | null
          id: string
          input_text: string
          instruction: string
          knowledge_version: string
          lead_id: string | null
          mode: string
          response: Json
          sources: Json
          tones: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          assistant: Database["public"]["Enums"]["ai_assistant_kind"]
          attachments?: Json
          copied_message?: string | null
          created_at?: string
          feedback?: string | null
          feedback_comment?: string | null
          id?: string
          input_text?: string
          instruction?: string
          knowledge_version?: string
          lead_id?: string | null
          mode?: string
          response?: Json
          sources?: Json
          tones?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          assistant?: Database["public"]["Enums"]["ai_assistant_kind"]
          attachments?: Json
          copied_message?: string | null
          created_at?: string
          feedback?: string | null
          feedback_comment?: string | null
          id?: string
          input_text?: string
          instruction?: string
          knowledge_version?: string
          lead_id?: string | null
          mode?: string
          response?: Json
          sources?: Json
          tones?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_items: {
        Row: {
          assistants: Database["public"]["Enums"]["ai_assistant_kind"][]
          category: string
          content: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["ai_knowledge_kind"]
          priority: number
          structured: Json
          title: string
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          assistants?: Database["public"]["Enums"]["ai_assistant_kind"][]
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["ai_knowledge_kind"]
          priority?: number
          structured?: Json
          title: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          assistants?: Database["public"]["Enums"]["ai_assistant_kind"][]
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["ai_knowledge_kind"]
          priority?: number
          structured?: Json
          title?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      ai_knowledge_versions: {
        Row: {
          action: string
          assistants: Database["public"]["Enums"]["ai_assistant_kind"][]
          changed_at: string
          changed_by: string | null
          id: string
          new_data: Json | null
          previous_data: Json | null
          reason: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          action?: string
          assistants?: Database["public"]["Enums"]["ai_assistant_kind"][]
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          assistants?: Database["public"]["Enums"]["ai_assistant_kind"][]
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string
          target_id?: string | null
          target_table?: string
        }
        Relationships: []
      }
      ai_negotiation_contexts: {
        Row: {
          already_reduced: string
          authorization_data: Json
          created_at: string
          current_condition: Json
          id: string
          lead_id: string
          narrative: string
          not_changed_yet: string
          presented: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          already_reduced?: string
          authorization_data?: Json
          created_at?: string
          current_condition?: Json
          id?: string
          lead_id: string
          narrative?: string
          not_changed_yet?: string
          presented?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          already_reduced?: string
          authorization_data?: Json
          created_at?: string
          current_condition?: Json
          id?: string
          lead_id?: string
          narrative?: string
          not_changed_yet?: string
          presented?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_negotiation_contexts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_objections: {
        Row: {
          assistants: Database["public"]["Enums"]["ai_assistant_kind"][]
          category: string
          created_at: string
          created_by: string | null
          diagnostic_questions: string
          id: string
          is_active: boolean
          mistakes_to_avoid: string
          objection: string
          possible_causes: string
          possible_condition: string
          recommended_approach: string
          updated_at: string
          updated_by: string | null
          when_to_ask_decision: string
          when_to_close: string
          when_to_followup: string
          when_to_work_value: string
        }
        Insert: {
          assistants?: Database["public"]["Enums"]["ai_assistant_kind"][]
          category?: string
          created_at?: string
          created_by?: string | null
          diagnostic_questions?: string
          id?: string
          is_active?: boolean
          mistakes_to_avoid?: string
          objection: string
          possible_causes?: string
          possible_condition?: string
          recommended_approach?: string
          updated_at?: string
          updated_by?: string | null
          when_to_ask_decision?: string
          when_to_close?: string
          when_to_followup?: string
          when_to_work_value?: string
        }
        Update: {
          assistants?: Database["public"]["Enums"]["ai_assistant_kind"][]
          category?: string
          created_at?: string
          created_by?: string | null
          diagnostic_questions?: string
          id?: string
          is_active?: boolean
          mistakes_to_avoid?: string
          objection?: string
          possible_causes?: string
          possible_condition?: string
          recommended_approach?: string
          updated_at?: string
          updated_by?: string | null
          when_to_ask_decision?: string
          when_to_close?: string
          when_to_followup?: string
          when_to_work_value?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          created_at: string
          duration_ms: number
          error_message: string | null
          estimated_cost_usd: number
          feature: string
          id: string
          input_tokens: number
          metadata: Json
          model: string
          output_tokens: number
          provider: string
          status: string
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          estimated_cost_usd?: number
          feature: string
          id?: string
          input_tokens?: number
          metadata?: Json
          model: string
          output_tokens?: number
          provider: string
          status?: string
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          estimated_cost_usd?: number
          feature?: string
          id?: string
          input_tokens?: number
          metadata?: Json
          model?: string
          output_tokens?: number
          provider?: string
          status?: string
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          brand_name: string
          brand_subtitle: string
          id: boolean
          logo_path: string | null
          updated_at: string
        }
        Insert: {
          brand_name?: string
          brand_subtitle?: string
          id?: boolean
          logo_path?: string | null
          updated_at?: string
        }
        Update: {
          brand_name?: string
          brand_subtitle?: string
          id?: boolean
          logo_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_outbound_events: {
        Row: {
          attempts: number
          created_at: string
          crm_lead_id: string
          error_message: string | null
          event_type: string
          http_status: number | null
          id: string
          payload: Json
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          crm_lead_id: string
          error_message?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          payload: Json
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          crm_lead_id?: string
          error_message?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_outbound_events_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkouts: {
        Row: {
          created_at: string
          data: string
          entrevistas_marcadas: number
          id: string
          interessados_gerados: number
          leads_novos_atribuidos: number
          leads_trabalhados: number
          ligacoes_atendidas: number
          ligacoes_feitas: number
          linkedin_msgs: number
          matriculas: number
          observacoes: string | null
          submitted_at: string
          updated_at: string
          vendedor_id: string
          whatsapp_msgs: number
        }
        Insert: {
          created_at?: string
          data: string
          entrevistas_marcadas?: number
          id?: string
          interessados_gerados?: number
          leads_novos_atribuidos?: number
          leads_trabalhados?: number
          ligacoes_atendidas?: number
          ligacoes_feitas?: number
          linkedin_msgs?: number
          matriculas?: number
          observacoes?: string | null
          submitted_at?: string
          updated_at?: string
          vendedor_id: string
          whatsapp_msgs?: number
        }
        Update: {
          created_at?: string
          data?: string
          entrevistas_marcadas?: number
          id?: string
          interessados_gerados?: number
          leads_novos_atribuidos?: number
          leads_trabalhados?: number
          ligacoes_atendidas?: number
          ligacoes_feitas?: number
          linkedin_msgs?: number
          matriculas?: number
          observacoes?: string | null
          submitted_at?: string
          updated_at?: string
          vendedor_id?: string
          whatsapp_msgs?: number
        }
        Relationships: []
      }
      google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          google_email: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          google_email?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          google_email?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      individual_feedbacks: {
        Row: {
          agreed_action: string
          created_at: string
          created_by: string | null
          extra_context: string
          final_feedback: string
          generated_feedback: string
          id: string
          leader_notes: string
          meeting_date: string | null
          metrics_snapshot: Json
          next_focus: string
          period_end: string
          period_label: string
          period_start: string
          shared_at: string | null
          shared_by: string | null
          shared_with_collaborator: boolean
          status: string
          subject_user_id: string
          tone: string
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          viewed_by_collaborator: boolean
        }
        Insert: {
          agreed_action?: string
          created_at?: string
          created_by?: string | null
          extra_context?: string
          final_feedback?: string
          generated_feedback?: string
          id?: string
          leader_notes?: string
          meeting_date?: string | null
          metrics_snapshot?: Json
          next_focus?: string
          period_end: string
          period_label?: string
          period_start: string
          shared_at?: string | null
          shared_by?: string | null
          shared_with_collaborator?: boolean
          status?: string
          subject_user_id: string
          tone?: string
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
          viewed_by_collaborator?: boolean
        }
        Update: {
          agreed_action?: string
          created_at?: string
          created_by?: string | null
          extra_context?: string
          final_feedback?: string
          generated_feedback?: string
          id?: string
          leader_notes?: string
          meeting_date?: string | null
          metrics_snapshot?: Json
          next_focus?: string
          period_end?: string
          period_label?: string
          period_start?: string
          shared_at?: string | null
          shared_by?: string | null
          shared_with_collaborator?: boolean
          status?: string
          subject_user_id?: string
          tone?: string
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
          viewed_by_collaborator?: boolean
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          created_at: string
          description: string | null
          event_type: string
          id: string
          lead_id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          lead_id: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_history: {
        Row: {
          changed_by: string | null
          conflict: boolean
          created_at: string
          field: string
          id: string
          lead_id: string
          new_value: string | null
          old_value: string | null
          owner_id: string
          source: string
        }
        Insert: {
          changed_by?: string | null
          conflict?: boolean
          created_at?: string
          field: string
          id?: string
          lead_id: string
          new_value?: string | null
          old_value?: string | null
          owner_id: string
          source?: string
        }
        Update: {
          changed_by?: string | null
          conflict?: boolean
          created_at?: string
          field?: string
          id?: string
          lead_id?: string
          new_value?: string | null
          old_value?: string | null
          owner_id?: string
          source?: string
        }
        Relationships: []
      }
      leadership_commission_audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          commission_id: string
          id: string
          new_data: Json | null
          previous_data: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          commission_id: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          commission_id?: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leadership_commission_audit_logs_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "leadership_commissions"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_commission_rules: {
        Row: {
          commission_percentage: number | null
          commission_type: Database["public"]["Enums"]["leadership_commission_type"]
          created_at: string
          created_by: string | null
          employee_id: string | null
          fixed_amount: number | null
          id: string
          is_active: boolean
          notes: string | null
          role_name: Database["public"]["Enums"]["app_role"] | null
          rule_scope: Database["public"]["Enums"]["leadership_rule_scope"]
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          commission_percentage?: number | null
          commission_type: Database["public"]["Enums"]["leadership_commission_type"]
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          role_name?: Database["public"]["Enums"]["app_role"] | null
          rule_scope: Database["public"]["Enums"]["leadership_rule_scope"]
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          commission_percentage?: number | null
          commission_type?: Database["public"]["Enums"]["leadership_commission_type"]
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          role_name?: Database["public"]["Enums"]["app_role"] | null
          rule_scope?: Database["public"]["Enums"]["leadership_rule_scope"]
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leadership_commission_rules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_commissions: {
        Row: {
          commission_amount: number | null
          commission_percentage_snapshot: number | null
          commission_rule_id: string | null
          commission_status: Database["public"]["Enums"]["leadership_commission_status"]
          commission_type_snapshot:
            | Database["public"]["Enums"]["leadership_commission_type"]
            | null
          created_at: string
          employee_id: string | null
          employee_name_snapshot: string | null
          employee_role_snapshot: Database["public"]["Enums"]["app_role"] | null
          enrollment_amount: number | null
          enrollment_date: string | null
          enrollment_status: string
          fixed_amount_snapshot: number | null
          id: string
          lead_id: string
          material_amount: number | null
          needs_compensation: boolean
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_date: string | null
          student_name: string | null
          updated_at: string
        }
        Insert: {
          commission_amount?: number | null
          commission_percentage_snapshot?: number | null
          commission_rule_id?: string | null
          commission_status?: Database["public"]["Enums"]["leadership_commission_status"]
          commission_type_snapshot?:
            | Database["public"]["Enums"]["leadership_commission_type"]
            | null
          created_at?: string
          employee_id?: string | null
          employee_name_snapshot?: string | null
          employee_role_snapshot?:
            | Database["public"]["Enums"]["app_role"]
            | null
          enrollment_amount?: number | null
          enrollment_date?: string | null
          enrollment_status?: string
          fixed_amount_snapshot?: number | null
          id?: string
          lead_id: string
          material_amount?: number | null
          needs_compensation?: boolean
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_date?: string | null
          student_name?: string | null
          updated_at?: string
        }
        Update: {
          commission_amount?: number | null
          commission_percentage_snapshot?: number | null
          commission_rule_id?: string | null
          commission_status?: Database["public"]["Enums"]["leadership_commission_status"]
          commission_type_snapshot?:
            | Database["public"]["Enums"]["leadership_commission_type"]
            | null
          created_at?: string
          employee_id?: string | null
          employee_name_snapshot?: string | null
          employee_role_snapshot?:
            | Database["public"]["Enums"]["app_role"]
            | null
          enrollment_amount?: number | null
          enrollment_date?: string | null
          enrollment_status?: string
          fixed_amount_snapshot?: number | null
          id?: string
          lead_id?: string
          material_amount?: number | null
          needs_compensation?: boolean
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_date?: string | null
          student_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadership_commissions_commission_rule_id_fkey"
            columns: ["commission_rule_id"]
            isOneToOne: false
            referencedRelation: "leadership_commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_commissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          city_state: string | null
          company: string | null
          company_name: string | null
          confirmation_status: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          email: string | null
          english_goal: string | null
          english_impact: string | null
          english_level: string | null
          enrollment_date: string | null
          enrollment_value: number | null
          external_lead_id: string | null
          financial_fit: string | null
          form_answers: Json
          form_completed: boolean
          form_status: string | null
          form_step: string | null
          high_priority: boolean
          id: string
          in_rescue: boolean
          interview_confirmed_at: string | null
          interview_date: string | null
          interview_done_date: string | null
          interview_intent: string | null
          interview_notes: string | null
          interview_original_date: string | null
          interview_reschedule_count: number
          interview_time: string | null
          last_confirmation_attempt_at: string | null
          last_contact_at: string | null
          last_source: string
          linkedin_url: string | null
          lost_at: string | null
          lost_opportunity: string | null
          lost_reason: Database["public"]["Enums"]["lost_reason"] | null
          lost_type: Database["public"]["Enums"]["lost_type"] | null
          material_value: number | null
          monthly_fee: number | null
          name: string
          next_followup_at: string | null
          observation: string | null
          owner_id: string
          phone: string | null
          phone_invalid: boolean
          phone_normalized: string | null
          profession: string | null
          requested_interview_at: string | null
          rescue_date: string | null
          rescued_at: string | null
          rescued_by: string | null
          scheduling_source: string | null
          scholarship_classification: string | null
          scholarship_notified_at: string | null
          scholarship_task_created: boolean
          sheets_row: number | null
          source: string | null
          source_system: string | null
          start_timeframe: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          updated_by: string | null
          why_not_studying: string | null
        }
        Insert: {
          city_state?: string | null
          company?: string | null
          company_name?: string | null
          confirmation_status?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          email?: string | null
          english_goal?: string | null
          english_impact?: string | null
          english_level?: string | null
          enrollment_date?: string | null
          enrollment_value?: number | null
          external_lead_id?: string | null
          financial_fit?: string | null
          form_answers?: Json
          form_completed?: boolean
          form_status?: string | null
          form_step?: string | null
          high_priority?: boolean
          id?: string
          in_rescue?: boolean
          interview_confirmed_at?: string | null
          interview_date?: string | null
          interview_done_date?: string | null
          interview_intent?: string | null
          interview_notes?: string | null
          interview_original_date?: string | null
          interview_reschedule_count?: number
          interview_time?: string | null
          last_confirmation_attempt_at?: string | null
          last_contact_at?: string | null
          last_source?: string
          linkedin_url?: string | null
          lost_at?: string | null
          lost_opportunity?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          lost_type?: Database["public"]["Enums"]["lost_type"] | null
          material_value?: number | null
          monthly_fee?: number | null
          name: string
          next_followup_at?: string | null
          observation?: string | null
          owner_id: string
          phone?: string | null
          phone_invalid?: boolean
          phone_normalized?: string | null
          profession?: string | null
          requested_interview_at?: string | null
          rescue_date?: string | null
          rescued_at?: string | null
          rescued_by?: string | null
          scheduling_source?: string | null
          scholarship_classification?: string | null
          scholarship_notified_at?: string | null
          scholarship_task_created?: boolean
          sheets_row?: number | null
          source?: string | null
          source_system?: string | null
          start_timeframe?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          updated_by?: string | null
          why_not_studying?: string | null
        }
        Update: {
          city_state?: string | null
          company?: string | null
          company_name?: string | null
          confirmation_status?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          email?: string | null
          english_goal?: string | null
          english_impact?: string | null
          english_level?: string | null
          enrollment_date?: string | null
          enrollment_value?: number | null
          external_lead_id?: string | null
          financial_fit?: string | null
          form_answers?: Json
          form_completed?: boolean
          form_status?: string | null
          form_step?: string | null
          high_priority?: boolean
          id?: string
          in_rescue?: boolean
          interview_confirmed_at?: string | null
          interview_date?: string | null
          interview_done_date?: string | null
          interview_intent?: string | null
          interview_notes?: string | null
          interview_original_date?: string | null
          interview_reschedule_count?: number
          interview_time?: string | null
          last_confirmation_attempt_at?: string | null
          last_contact_at?: string | null
          last_source?: string
          linkedin_url?: string | null
          lost_at?: string | null
          lost_opportunity?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          lost_type?: Database["public"]["Enums"]["lost_type"] | null
          material_value?: number | null
          monthly_fee?: number | null
          name?: string
          next_followup_at?: string | null
          observation?: string | null
          owner_id?: string
          phone?: string | null
          phone_invalid?: boolean
          phone_normalized?: string | null
          profession?: string | null
          requested_interview_at?: string | null
          rescue_date?: string | null
          rescued_at?: string | null
          rescued_by?: string | null
          scheduling_source?: string | null
          scholarship_classification?: string | null
          scholarship_notified_at?: string | null
          scholarship_task_created?: boolean
          sheets_row?: number | null
          source?: string | null
          source_system?: string | null
          start_timeframe?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          updated_by?: string | null
          why_not_studying?: string | null
        }
        Relationships: []
      }
      linkedin_message_events: {
        Row: {
          created_at: string
          external_event_id: string
          id: string
          installation_id: string | null
          sent_at: string
          source: string
          tracker_user_id: string | null
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          external_event_id: string
          id?: string
          installation_id?: string | null
          sent_at: string
          source?: string
          tracker_user_id?: string | null
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          created_at?: string
          external_event_id?: string
          id?: string
          installation_id?: string | null
          sent_at?: string
          source?: string
          tracker_user_id?: string | null
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: []
      }
      material_bonus_closings: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          considered_ids: Json
          created_at: string
          id: string
          notes: string | null
          per_seller: Json
          reference_month: number
          reference_year: number
          team_bonus_status: string
          team_goal: number | null
          team_id: string | null
          team_valid_total: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          considered_ids?: Json
          created_at?: string
          id?: string
          notes?: string | null
          per_seller?: Json
          reference_month: number
          reference_year: number
          team_bonus_status?: string
          team_goal?: number | null
          team_id?: string | null
          team_valid_total?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          considered_ids?: Json
          created_at?: string
          id?: string
          notes?: string | null
          per_seller?: Json
          reference_month?: number
          reference_year?: number
          team_bonus_status?: string
          team_goal?: number | null
          team_id?: string | null
          team_valid_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_bonus_closings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      material_bonus_goals: {
        Row: {
          bonus_amount: number | null
          created_at: string
          effective_from: string
          effective_until: string | null
          goal_type: Database["public"]["Enums"]["material_goal_type"]
          id: string
          is_active: boolean
          minimum_amount: number
          seller_id: string | null
          team_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bonus_amount?: number | null
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          goal_type: Database["public"]["Enums"]["material_goal_type"]
          id?: string
          is_active?: boolean
          minimum_amount: number
          seller_id?: string | null
          team_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bonus_amount?: number | null
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          goal_type?: Database["public"]["Enums"]["material_goal_type"]
          id?: string
          is_active?: boolean
          minimum_amount?: number
          seller_id?: string | null
          team_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_bonus_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      material_bonus_rules: {
        Row: {
          cash_discount_reference: number
          cash_minimum_value: number
          created_at: string
          credit_single_installment_is_cash: boolean
          effective_from: string
          effective_until: string | null
          id: string
          is_active: boolean
          material_type: Database["public"]["Enums"]["material_type"]
          regular_minimum_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cash_discount_reference?: number
          cash_minimum_value: number
          created_at?: string
          credit_single_installment_is_cash?: boolean
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          material_type: Database["public"]["Enums"]["material_type"]
          regular_minimum_value: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cash_discount_reference?: number
          cash_minimum_value?: number
          created_at?: string
          credit_single_installment_is_cash?: boolean
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          material_type?: Database["public"]["Enums"]["material_type"]
          regular_minimum_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      material_sales: {
        Row: {
          bonus_eligibility_reason: Database["public"]["Enums"]["material_bonus_reason"]
          cancelled_at: string | null
          cancelled_by: string | null
          cash_discount_percentage_snapshot: number | null
          created_at: string
          created_by: string | null
          eligible_for_bonus: boolean
          enrollment_date: string | null
          id: string
          installment_count: number | null
          lead_id: string
          material_type: Database["public"]["Enums"]["material_type"] | null
          minimum_allowed_value_snapshot: number | null
          notes: string | null
          payment_condition:
            | Database["public"]["Enums"]["material_payment_condition"]
            | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_date: string | null
          payment_method:
            | Database["public"]["Enums"]["material_payment_method"]
            | null
          payment_status: Database["public"]["Enums"]["material_payment_status"]
          price_rule_valid: boolean
          refunded_at: string | null
          refunded_by: string | null
          retroactive_adjustment: boolean
          rule_id_snapshot: string | null
          sale_value: number | null
          seller_id: string
          table_value_snapshot: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bonus_eligibility_reason?: Database["public"]["Enums"]["material_bonus_reason"]
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_discount_percentage_snapshot?: number | null
          created_at?: string
          created_by?: string | null
          eligible_for_bonus?: boolean
          enrollment_date?: string | null
          id?: string
          installment_count?: number | null
          lead_id: string
          material_type?: Database["public"]["Enums"]["material_type"] | null
          minimum_allowed_value_snapshot?: number | null
          notes?: string | null
          payment_condition?:
            | Database["public"]["Enums"]["material_payment_condition"]
            | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_date?: string | null
          payment_method?:
            | Database["public"]["Enums"]["material_payment_method"]
            | null
          payment_status?: Database["public"]["Enums"]["material_payment_status"]
          price_rule_valid?: boolean
          refunded_at?: string | null
          refunded_by?: string | null
          retroactive_adjustment?: boolean
          rule_id_snapshot?: string | null
          sale_value?: number | null
          seller_id: string
          table_value_snapshot?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bonus_eligibility_reason?: Database["public"]["Enums"]["material_bonus_reason"]
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_discount_percentage_snapshot?: number | null
          created_at?: string
          created_by?: string | null
          eligible_for_bonus?: boolean
          enrollment_date?: string | null
          id?: string
          installment_count?: number | null
          lead_id?: string
          material_type?: Database["public"]["Enums"]["material_type"] | null
          minimum_allowed_value_snapshot?: number | null
          notes?: string | null
          payment_condition?:
            | Database["public"]["Enums"]["material_payment_condition"]
            | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_date?: string | null
          payment_method?:
            | Database["public"]["Enums"]["material_payment_method"]
            | null
          payment_status?: Database["public"]["Enums"]["material_payment_status"]
          price_rule_valid?: boolean
          refunded_at?: string | null
          refunded_by?: string | null
          retroactive_adjustment?: boolean
          rule_id_snapshot?: string | null
          sale_value?: number | null
          seller_id?: string
          table_value_snapshot?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_sales_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      material_sales_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          material_sale_id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          material_sale_id: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          material_sale_id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "material_sales_history_material_sale_id_fkey"
            columns: ["material_sale_id"]
            isOneToOne: false
            referencedRelation: "material_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_hall_of_fame: {
        Row: {
          calculation_rules_snapshot: Json
          category_winners: Json
          champion_points: number | null
          champion_user_id: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          period_end: string
          period_start: string
          ranking_snapshot: Json
          reference_month: number
          reference_year: number
          revision_history: Json
          runner_up_points: number | null
          runner_up_user_id: string | null
          status: string
          team_id: string | null
          third_place_points: number | null
          third_place_user_id: string | null
          updated_at: string
        }
        Insert: {
          calculation_rules_snapshot?: Json
          category_winners?: Json
          champion_points?: number | null
          champion_user_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          ranking_snapshot?: Json
          reference_month: number
          reference_year: number
          revision_history?: Json
          runner_up_points?: number | null
          runner_up_user_id?: string | null
          status?: string
          team_id?: string | null
          third_place_points?: number | null
          third_place_user_id?: string | null
          updated_at?: string
        }
        Update: {
          calculation_rules_snapshot?: Json
          category_winners?: Json
          champion_points?: number | null
          champion_user_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          ranking_snapshot?: Json
          reference_month?: number
          reference_year?: number
          revision_history?: Json
          runner_up_points?: number | null
          runner_up_user_id?: string | null
          status?: string
          team_id?: string | null
          third_place_points?: number | null
          third_place_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_hall_of_fame_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_account_security: {
        Row: {
          created_at: string
          deactivated_at: string | null
          last_sign_in_at: string | null
          must_change_password: boolean
          sign_in_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          last_sign_in_at?: string | null
          must_change_password?: boolean
          sign_in_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          last_sign_in_at?: string | null
          must_change_password?: boolean
          sign_in_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_account_security_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          eligible_for_hall_of_fame: boolean
          email: string | null
          full_name: string
          id: string
          team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          eligible_for_hall_of_fame?: boolean
          email?: string | null
          full_name?: string
          id: string
          team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          eligible_for_hall_of_fame?: boolean
          email?: string | null
          full_name?: string
          id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_attempts: {
        Row: {
          atendida: boolean | null
          codigo_operadora_interurbano: string | null
          created_at: string
          ddd_destino_contato: string | null
          ddd_origem_vendedor: string | null
          id: string
          observacao: string | null
          prefixo_interurbano: string | null
          prospect_contact_id: string
          resultado: string | null
          telefone_normalizado: string | null
          telefone_para_discagem: string | null
          tipo_acao: string
          vendedor_id: string | null
        }
        Insert: {
          atendida?: boolean | null
          codigo_operadora_interurbano?: string | null
          created_at?: string
          ddd_destino_contato?: string | null
          ddd_origem_vendedor?: string | null
          id?: string
          observacao?: string | null
          prefixo_interurbano?: string | null
          prospect_contact_id: string
          resultado?: string | null
          telefone_normalizado?: string | null
          telefone_para_discagem?: string | null
          tipo_acao: string
          vendedor_id?: string | null
        }
        Update: {
          atendida?: boolean | null
          codigo_operadora_interurbano?: string | null
          created_at?: string
          ddd_destino_contato?: string | null
          ddd_origem_vendedor?: string | null
          id?: string
          observacao?: string | null
          prefixo_interurbano?: string | null
          prospect_contact_id?: string
          resultado?: string | null
          telefone_normalizado?: string | null
          telefone_para_discagem?: string | null
          tipo_acao?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_attempts_prospect_contact_id_fkey"
            columns: ["prospect_contact_id"]
            isOneToOne: false
            referencedRelation: "prospect_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_attempts_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_contacts: {
        Row: {
          assigned_at: string | null
          cargo: string | null
          convertido_em_lead: boolean
          created_at: string
          created_by: string | null
          ddd: string | null
          empresa: string | null
          id: string
          lead_id: string | null
          linkedin_url: string | null
          nao_chamar: boolean
          nome: string | null
          observacao: string | null
          origem: string | null
          proxima_tentativa: string | null
          quantidade_tentativas: number
          status_prospeccao: string
          telefone_invalido: boolean
          telefone_normalizado: string
          telefone_original: string | null
          ultima_tentativa: string | null
          updated_at: string
          vendedor_responsavel_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          cargo?: string | null
          convertido_em_lead?: boolean
          created_at?: string
          created_by?: string | null
          ddd?: string | null
          empresa?: string | null
          id?: string
          lead_id?: string | null
          linkedin_url?: string | null
          nao_chamar?: boolean
          nome?: string | null
          observacao?: string | null
          origem?: string | null
          proxima_tentativa?: string | null
          quantidade_tentativas?: number
          status_prospeccao?: string
          telefone_invalido?: boolean
          telefone_normalizado: string
          telefone_original?: string | null
          ultima_tentativa?: string | null
          updated_at?: string
          vendedor_responsavel_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          cargo?: string | null
          convertido_em_lead?: boolean
          created_at?: string
          created_by?: string | null
          ddd?: string | null
          empresa?: string | null
          id?: string
          lead_id?: string | null
          linkedin_url?: string | null
          nao_chamar?: boolean
          nome?: string | null
          observacao?: string | null
          origem?: string | null
          proxima_tentativa?: string | null
          quantidade_tentativas?: number
          status_prospeccao?: string
          telefone_invalido?: boolean
          telefone_normalizado?: string
          telefone_original?: string | null
          ultima_tentativa?: string | null
          updated_at?: string
          vendedor_responsavel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_contacts_vendedor_responsavel_id_fkey"
            columns: ["vendedor_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_dialer_settings: {
        Row: {
          codigo_operadora_interurbano: string
          created_at: string
          ddd_origem: string
          prefixo_interurbano: string
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo_operadora_interurbano?: string
          created_at?: string
          ddd_origem?: string
          prefixo_interurbano?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo_operadora_interurbano?: string
          created_at?: string
          ddd_origem?: string
          prefixo_interurbano?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      public_seller_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          public_slug: string
          seller_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          public_slug: string
          seller_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          public_slug?: string
          seller_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_seller_links_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_scripts: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      score_settings: {
        Row: {
          activity_key: string
          activity_label: string
          id: string
          points: number
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_key: string
          activity_label: string
          id?: string
          points?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_key?: string
          activity_label?: string
          id?: string
          points?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      score_settings_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json
          previous_values: Json
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json
          previous_values?: Json
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json
          previous_values?: Json
        }
        Relationships: []
      }
      seller_commission_rules: {
        Row: {
          commission_percentage: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          seller_id: string
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          commission_percentage: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          seller_id: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          commission_percentage?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          seller_id?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_commission_rules_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_commissions: {
        Row: {
          commission_amount: number | null
          commission_percentage_snapshot: number | null
          commission_rule_id: string | null
          created_at: string
          enrollment_date: string | null
          enrollment_value_snapshot: number | null
          id: string
          lead_id: string
          notes: string | null
          seller_id: string | null
          seller_name_snapshot: string | null
          status: Database["public"]["Enums"]["seller_commission_status"]
          student_name_snapshot: string | null
          updated_at: string
        }
        Insert: {
          commission_amount?: number | null
          commission_percentage_snapshot?: number | null
          commission_rule_id?: string | null
          created_at?: string
          enrollment_date?: string | null
          enrollment_value_snapshot?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          seller_id?: string | null
          seller_name_snapshot?: string | null
          status?: Database["public"]["Enums"]["seller_commission_status"]
          student_name_snapshot?: string | null
          updated_at?: string
        }
        Update: {
          commission_amount?: number | null
          commission_percentage_snapshot?: number | null
          commission_rule_id?: string | null
          created_at?: string
          enrollment_date?: string | null
          enrollment_value_snapshot?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          seller_id?: string | null
          seller_name_snapshot?: string | null
          status?: Database["public"]["Enums"]["seller_commission_status"]
          student_name_snapshot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_commissions_commission_rule_id_fkey"
            columns: ["commission_rule_id"]
            isOneToOne: false
            referencedRelation: "seller_commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_commissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_daily_goals: {
        Row: {
          created_at: string
          daily_calls_goal: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_calls_goal?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_calls_goal?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_enrollment_goals: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          month: number
          notes: string | null
          seller_id: string
          target_enrollments: number
          team_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          month: number
          notes?: string | null
          seller_id: string
          target_enrollments: number
          team_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          month?: number
          notes?: string | null
          seller_id?: string
          target_enrollments?: number
          team_id?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_enrollment_goals_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_enrollment_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      share_phrases: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      share_preferences: {
        Row: {
          created_at: string
          preferred_format: string
          preferred_phrase: string | null
          preferred_template: string
          preferred_title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          preferred_format?: string
          preferred_phrase?: string | null
          preferred_template?: string
          preferred_title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          preferred_format?: string
          preferred_phrase?: string | null
          preferred_template?: string
          preferred_title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sheet_integrations: {
        Row: {
          created_at: string
          last_error: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          sheet_title: string | null
          spreadsheet_id: string
          spreadsheet_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          sheet_title?: string | null
          spreadsheet_id: string
          spreadsheet_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          sheet_title?: string | null
          spreadsheet_id?: string
          spreadsheet_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          attempts: number
          created_at: string
          direction: string
          id: string
          last_error: string | null
          lead_id: string | null
          op: string
          owner_id: string
          payload: Json | null
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          direction: string
          id?: string
          last_error?: string | null
          lead_id?: string | null
          op: string
          owner_id: string
          payload?: Json | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          direction?: string
          id?: string
          last_error?: string | null
          lead_id?: string | null
          op?: string
          owner_id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          due_date: string
          due_time: string | null
          id: string
          is_rescue: boolean
          lead_id: string | null
          notified_at: string | null
          observation: string | null
          owner_id: string
          prospect_contact_id: string | null
          rescue_reason: Database["public"]["Enums"]["lost_reason"] | null
          status: Database["public"]["Enums"]["task_status"]
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          due_time?: string | null
          id?: string
          is_rescue?: boolean
          lead_id?: string | null
          notified_at?: string | null
          observation?: string | null
          owner_id: string
          prospect_contact_id?: string | null
          rescue_reason?: Database["public"]["Enums"]["lost_reason"] | null
          status?: Database["public"]["Enums"]["task_status"]
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          due_time?: string | null
          id?: string
          is_rescue?: boolean
          lead_id?: string | null
          notified_at?: string | null
          observation?: string | null
          owner_id?: string
          prospect_contact_id?: string | null
          rescue_reason?: Database["public"]["Enums"]["lost_reason"] | null
          status?: Database["public"]["Enums"]["task_status"]
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prospect_contact_id_fkey"
            columns: ["prospect_contact_id"]
            isOneToOne: false
            referencedRelation: "prospect_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      team_goals: {
        Row: {
          created_at: string
          daily_calls_goal: number
          daily_enrollments_goal: number
          daily_interviews_goal: number
          id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_calls_goal?: number
          daily_enrollments_goal?: number
          daily_interviews_goal?: number
          id?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_calls_goal?: number
          daily_enrollments_goal?: number
          daily_interviews_goal?: number
          id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_membership_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_team_id: string
          previous_team_id: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_team_id: string
          previous_team_id?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_team_id?: string
          previous_team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_membership_history_new_team_id_fkey"
            columns: ["new_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_membership_history_previous_team_id_fkey"
            columns: ["previous_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_mission_settings: {
        Row: {
          created_at: string
          day_close_hour: number
          done_to_enrollment_rate_max: number
          done_to_enrollment_rate_min: number
          id: boolean
          interested_to_enrollment_rate: number
          min_sample_done: number
          min_sample_enrollments: number
          min_sample_interested: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          day_close_hour?: number
          done_to_enrollment_rate_max?: number
          done_to_enrollment_rate_min?: number
          id?: boolean
          interested_to_enrollment_rate?: number
          min_sample_done?: number
          min_sample_enrollments?: number
          min_sample_interested?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          day_close_hour?: number
          done_to_enrollment_rate_max?: number
          done_to_enrollment_rate_min?: number
          id?: boolean
          interested_to_enrollment_rate?: number
          min_sample_done?: number
          min_sample_enrollments?: number
          min_sample_interested?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          include_in_main_dashboard: boolean
          is_active: boolean
          is_primary: boolean
          manager_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          include_in_main_dashboard?: boolean
          is_active?: boolean
          is_primary?: boolean
          manager_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          include_in_main_dashboard?: boolean
          is_active?: boolean
          is_primary?: boolean
          manager_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_type: string
          created_at: string
          hall_of_fame_id: string | null
          id: string
          metadata: Json
          reference_month: number
          reference_year: number
          title: string
          user_id: string
        }
        Insert: {
          achievement_type: string
          created_at?: string
          hall_of_fame_id?: string | null
          id?: string
          metadata?: Json
          reference_month: number
          reference_year: number
          title: string
          user_id: string
        }
        Update: {
          achievement_type?: string
          created_at?: string
          hall_of_fame_id?: string | null
          id?: string
          metadata?: Json
          reference_month?: number
          reference_year?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_hall_of_fame_id_fkey"
            columns: ["hall_of_fame_id"]
            isOneToOne: false
            referencedRelation: "monthly_hall_of_fame"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_list_entries: {
        Row: {
          created_at: string
          followup_task_id: string | null
          id: string
          last_message_body: string | null
          last_template_id: string | null
          last_template_name: string | null
          message_copied_at: string | null
          message_sent_at: string | null
          no_response_at: string | null
          notes: string | null
          owner_id: string
          prospect_contact_id: string
          reason: string
          removed_at: string | null
          responded_at: string | null
          status: string
          updated_at: string
          whatsapp_opened_at: string | null
        }
        Insert: {
          created_at?: string
          followup_task_id?: string | null
          id?: string
          last_message_body?: string | null
          last_template_id?: string | null
          last_template_name?: string | null
          message_copied_at?: string | null
          message_sent_at?: string | null
          no_response_at?: string | null
          notes?: string | null
          owner_id: string
          prospect_contact_id: string
          reason?: string
          removed_at?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_opened_at?: string | null
        }
        Update: {
          created_at?: string
          followup_task_id?: string | null
          id?: string
          last_message_body?: string | null
          last_template_id?: string | null
          last_template_name?: string | null
          message_copied_at?: string | null
          message_sent_at?: string | null
          no_response_at?: string | null
          notes?: string | null
          owner_id?: string
          prospect_contact_id?: string
          reason?: string
          removed_at?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_opened_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_list_entries_followup_task_id_fkey"
            columns: ["followup_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_list_entries_last_template_id_fkey"
            columns: ["last_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_list_entries_prospect_contact_id_fkey"
            columns: ["prospect_contact_id"]
            isOneToOne: false
            referencedRelation: "prospect_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          active: boolean
          body: string
          category: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          category?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_contact_via_whatsapp_list: {
        Args: { _contact_id: string }
        Returns: boolean
      }
      debug_entrevistas_marcadas: {
        Args: { _end: string; _start: string; _vendedor_id?: string }
        Returns: {
          interview_date: string
          lead_id: string
          nome: string
          owner_id: string
          status: string
        }[]
      }
      ensure_leadership_commission: {
        Args: { _lead_id: string; _recalculate?: boolean }
        Returns: string
      }
      ensure_seller_commission: {
        Args: { _lead_id: string; _reprice?: boolean }
        Returns: string
      }
      hall_of_fame_active_days: {
        Args: { _end: string; _start: string; _team_id?: string }
        Returns: {
          active_days: number
          vendedor_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      interested_audit: {
        Args: { _end: string; _start: string }
        Returns: {
          backfilled: boolean
          became_interested_at: string
          current_seller_id: string
          current_seller_name: string
          current_status: string
          divergence_reason: string
          event_seller_id: string
          event_seller_name: string
          lead_id: string
          nome: string
          origem: string
        }[]
      }
      lead_phones_lookup: {
        Args: { _phones: string[] }
        Returns: {
          phone_normalized: string
        }[]
      }
      mark_feedback_viewed: { Args: { _id: string }; Returns: boolean }
      my_account_flags: {
        Args: never
        Returns: {
          must_change_password: boolean
          sign_in_count: number
          status: string
        }[]
      }
      my_shared_feedbacks: {
        Args: never
        Returns: {
          admin_name: string
          agreed_action: string
          final_feedback: string
          id: string
          meeting_date: string
          next_focus: string
          period_end: string
          period_label: string
          period_start: string
          shared_at: string
          viewed_at: string
          viewed_by_collaborator: boolean
        }[]
      }
      productivity_summary: {
        Args: {
          _end: string
          _start: string
          _team_id?: string
          _vendedor_id?: string
        }
        Returns: Json
      }
      prospect_dashboard: { Args: { _team_id?: string }; Returns: Json }
      prospect_phones_lookup: {
        Args: { _phones: string[] }
        Returns: {
          cargo: string
          empresa: string
          id: string
          linkedin_url: string
          nome: string
          observacao: string
          origem: string
          status_prospeccao: string
          telefone_normalizado: string
          vendedor_responsavel_id: string
        }[]
      }
      record_sign_in: { Args: never; Returns: undefined }
      resolve_leadership_commission_rule: {
        Args: { _employee_id: string; _on_date: string }
        Returns: {
          commission_percentage: number | null
          commission_type: Database["public"]["Enums"]["leadership_commission_type"]
          created_at: string
          created_by: string | null
          employee_id: string | null
          fixed_amount: number | null
          id: string
          is_active: boolean
          notes: string | null
          role_name: Database["public"]["Enums"]["app_role"] | null
          rule_scope: Database["public"]["Enums"]["leadership_rule_scope"]
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "leadership_commission_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_seller_commission_rule: {
        Args: { _on_date: string; _seller_id: string }
        Returns: {
          commission_percentage: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          seller_id: string
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "seller_commission_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_enrollment_goal_summary: {
        Args: { _month: number; _team_id?: string; _year: number }
        Returns: Json
      }
      teams_overview: { Args: never; Returns: Json }
    }
    Enums: {
      ai_assistant_kind: "prospeccao" | "entrevista" | "negociacao"
      ai_knowledge_kind:
        | "conhecimento"
        | "curso"
        | "valores"
        | "limites"
        | "materiais"
        | "inicio"
        | "estrategia"
        | "frase_aprovada"
        | "frase_proibida"
        | "spin"
        | "criterio"
        | "comportamento"
      app_role: "admin" | "franqueado" | "vendedor"
      lead_status:
        | "novo"
        | "interessado"
        | "entrevista_marcada"
        | "entrevista_realizada"
        | "matricula"
        | "perdido"
      leadership_commission_status:
        | "nao_configurada"
        | "prevista"
        | "confirmada"
        | "paga"
        | "cancelada"
        | "estornada"
      leadership_commission_type: "percentage" | "fixed"
      leadership_rule_scope: "individual" | "role"
      lost_reason:
        | "sem_resposta"
        | "sem_interesse"
        | "sem_dinheiro"
        | "achou_caro"
        | "sem_tempo"
        | "vai_deixar_depois"
        | "nao_compareceu"
        | "sem_perfil"
        | "fechou_concorrente"
        | "nao_chamar"
        | "outro"
      lost_type: "definitivo" | "com_resgate"
      material_bonus_reason:
        | "eligible"
        | "pending_payment"
        | "paid_outside_enrollment_month"
        | "below_minimum_price"
        | "invalid_payment_condition"
        | "cancelled"
        | "refunded"
        | "exempt"
        | "missing_information"
        | "duplicate_record"
      material_goal_type: "individual" | "team"
      material_payment_condition: "cash" | "installment"
      material_payment_method:
        | "pix"
        | "dinheiro"
        | "debito"
        | "credito"
        | "boleto"
        | "transferencia"
        | "outro"
      material_payment_status:
        | "pending"
        | "paid"
        | "exempt"
        | "cancelled"
        | "refunded"
      material_type: "digital" | "physical"
      seller_commission_status: "nao_configurada" | "prevista" | "cancelada"
      task_status: "pendente" | "concluida" | "remarcada" | "cancelada"
      task_type:
        | "enviar_mensagem"
        | "fazer_ligacao"
        | "confirmar_entrevista"
        | "reagendar_entrevista"
        | "followup_pos"
        | "cobrar_decisao"
        | "encerramento"
        | "resgate"
        | "outro"
        | "primeiro_contato"
        | "ligar"
        | "retorno_ligacao"
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
      ai_assistant_kind: ["prospeccao", "entrevista", "negociacao"],
      ai_knowledge_kind: [
        "conhecimento",
        "curso",
        "valores",
        "limites",
        "materiais",
        "inicio",
        "estrategia",
        "frase_aprovada",
        "frase_proibida",
        "spin",
        "criterio",
        "comportamento",
      ],
      app_role: ["admin", "franqueado", "vendedor"],
      lead_status: [
        "novo",
        "interessado",
        "entrevista_marcada",
        "entrevista_realizada",
        "matricula",
        "perdido",
      ],
      leadership_commission_status: [
        "nao_configurada",
        "prevista",
        "confirmada",
        "paga",
        "cancelada",
        "estornada",
      ],
      leadership_commission_type: ["percentage", "fixed"],
      leadership_rule_scope: ["individual", "role"],
      lost_reason: [
        "sem_resposta",
        "sem_interesse",
        "sem_dinheiro",
        "achou_caro",
        "sem_tempo",
        "vai_deixar_depois",
        "nao_compareceu",
        "sem_perfil",
        "fechou_concorrente",
        "nao_chamar",
        "outro",
      ],
      lost_type: ["definitivo", "com_resgate"],
      material_bonus_reason: [
        "eligible",
        "pending_payment",
        "paid_outside_enrollment_month",
        "below_minimum_price",
        "invalid_payment_condition",
        "cancelled",
        "refunded",
        "exempt",
        "missing_information",
        "duplicate_record",
      ],
      material_goal_type: ["individual", "team"],
      material_payment_condition: ["cash", "installment"],
      material_payment_method: [
        "pix",
        "dinheiro",
        "debito",
        "credito",
        "boleto",
        "transferencia",
        "outro",
      ],
      material_payment_status: [
        "pending",
        "paid",
        "exempt",
        "cancelled",
        "refunded",
      ],
      material_type: ["digital", "physical"],
      seller_commission_status: ["nao_configurada", "prevista", "cancelada"],
      task_status: ["pendente", "concluida", "remarcada", "cancelada"],
      task_type: [
        "enviar_mensagem",
        "fazer_ligacao",
        "confirmar_entrevista",
        "reagendar_entrevista",
        "followup_pos",
        "cobrar_decisao",
        "encerramento",
        "resgate",
        "outro",
        "primeiro_contato",
        "ligar",
        "retorno_ligacao",
      ],
    },
  },
} as const
