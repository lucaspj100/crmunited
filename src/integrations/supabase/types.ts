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
      leads: {
        Row: {
          company: string | null
          created_at: string
          id: string
          interview_date: string | null
          interview_notes: string | null
          interview_time: string | null
          linkedin_url: string | null
          lost_reason: Database["public"]["Enums"]["lost_reason"] | null
          lost_type: Database["public"]["Enums"]["lost_type"] | null
          name: string
          observation: string | null
          owner_id: string
          phone: string | null
          rescue_date: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          interview_time?: string | null
          linkedin_url?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          lost_type?: Database["public"]["Enums"]["lost_type"] | null
          name: string
          observation?: string | null
          owner_id: string
          phone?: string | null
          rescue_date?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          interview_time?: string | null
          linkedin_url?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          lost_type?: Database["public"]["Enums"]["lost_type"] | null
          name?: string
          observation?: string | null
          owner_id?: string
          phone?: string | null
          rescue_date?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
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
      ],
    },
  },
} as const
