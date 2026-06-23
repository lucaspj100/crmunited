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
      leads: {
        Row: {
          company: string | null
          created_at: string
          enrollment_value: number | null
          id: string
          in_rescue: boolean
          interview_confirmed_at: string | null
          interview_date: string | null
          interview_notes: string | null
          interview_time: string | null
          last_contact_at: string | null
          last_source: string
          linkedin_url: string | null
          lost_at: string | null
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
          rescue_date: string | null
          rescued_at: string | null
          rescued_by: string | null
          sheets_row: number | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          enrollment_value?: number | null
          id?: string
          in_rescue?: boolean
          interview_confirmed_at?: string | null
          interview_date?: string | null
          interview_notes?: string | null
          interview_time?: string | null
          last_contact_at?: string | null
          last_source?: string
          linkedin_url?: string | null
          lost_at?: string | null
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
          rescue_date?: string | null
          rescued_at?: string | null
          rescued_by?: string | null
          sheets_row?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          enrollment_value?: number | null
          id?: string
          in_rescue?: boolean
          interview_confirmed_at?: string | null
          interview_date?: string | null
          interview_notes?: string | null
          interview_time?: string | null
          last_contact_at?: string | null
          last_source?: string
          linkedin_url?: string | null
          lost_at?: string | null
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
          rescue_date?: string | null
          rescued_at?: string | null
          rescued_by?: string | null
          sheets_row?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      prospect_attempts: {
        Row: {
          codigo_operadora_interurbano: string | null
          created_at: string
          ddd_destino_contato: string | null
          ddd_origem_vendedor: string | null
          id: string
          observacao: string | null
          prospect_contact_id: string
          resultado: string | null
          telefone_normalizado: string | null
          telefone_para_discagem: string | null
          tipo_acao: string
          vendedor_id: string | null
        }
        Insert: {
          codigo_operadora_interurbano?: string | null
          created_at?: string
          ddd_destino_contato?: string | null
          ddd_origem_vendedor?: string | null
          id?: string
          observacao?: string | null
          prospect_contact_id: string
          resultado?: string | null
          telefone_normalizado?: string | null
          telefone_para_discagem?: string | null
          tipo_acao: string
          vendedor_id?: string | null
        }
        Update: {
          codigo_operadora_interurbano?: string | null
          created_at?: string
          ddd_destino_contato?: string | null
          ddd_origem_vendedor?: string | null
          id?: string
          observacao?: string | null
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
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo_operadora_interurbano?: string
          created_at?: string
          ddd_origem?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo_operadora_interurbano?: string
          created_at?: string
          ddd_origem?: string
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
          lead_id: string
          observation: string | null
          owner_id: string
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
          lead_id: string
          observation?: string | null
          owner_id: string
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
          lead_id?: string
          observation?: string | null
          owner_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "franqueado" | "vendedor"
      lead_status:
        | "novo"
        | "interessado"
        | "entrevista_marcada"
        | "entrevista_realizada"
        | "matricula"
        | "perdido"
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
      app_role: ["admin", "franqueado", "vendedor"],
      lead_status: [
        "novo",
        "interessado",
        "entrevista_marcada",
        "entrevista_realizada",
        "matricula",
        "perdido",
      ],
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
      ],
    },
  },
} as const
