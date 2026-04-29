export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          input_context: Json
          needs_feedback: boolean
          output: string | null
          suggested_state: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id: string
          user_feedback: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          input_context?: Json
          needs_feedback?: boolean
          output?: string | null
          suggested_state?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id: string
          user_feedback?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          input_context?: Json
          needs_feedback?: boolean
          output?: string | null
          suggested_state?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id?: string
          user_feedback?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          email: string | null
          id: string
          last_interaction_at: string | null
          name: string
          notes: string | null
          organization: string | null
          relationship_tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          name: string
          notes?: string | null
          organization?: string | null
          relationship_tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          name?: string
          notes?: string | null
          organization?: string | null
          relationship_tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ticket_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["ticket_event_type"]
          id: string
          payload: Json
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["ticket_event_type"]
          id?: string
          payload?: Json
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["ticket_event_type"]
          id?: string
          payload?: Json
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_open_questions: {
        Row: {
          asked_at: string
          created_at: string
          id: string
          question: string
          resolution: string | null
          resolved_at: string | null
          ticket_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asked_at?: string
          created_at?: string
          id?: string
          question: string
          resolution?: string | null
          resolved_at?: string | null
          ticket_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asked_at?: string
          created_at?: string
          id?: string
          question?: string
          resolution?: string | null
          resolved_at?: string | null
          ticket_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_open_questions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_participants: {
        Row: {
          created_at: string
          person_id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          person_id: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          person_id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_participants_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_references: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["ticket_reference_kind"]
          label: string | null
          ticket_id: string
          updated_at: string
          url_or_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ticket_reference_kind"]
          label?: string | null
          ticket_id: string
          updated_at?: string
          url_or_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ticket_reference_kind"]
          label?: string | null
          ticket_id?: string
          updated_at?: string
          url_or_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_references_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_relations: {
        Row: {
          created_at: string
          related_ticket_id: string
          relation_type: Database["public"]["Enums"]["ticket_relation_type"]
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          related_ticket_id: string
          relation_type: Database["public"]["Enums"]["ticket_relation_type"]
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          related_ticket_id?: string
          relation_type?: Database["public"]["Enums"]["ticket_relation_type"]
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_relations_related_ticket_id_fkey"
            columns: ["related_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_relations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          agent_mode: Database["public"]["Enums"]["agent_mode"]
          agent_status: Database["public"]["Enums"]["agent_status"]
          closed_at: string | null
          context: string | null
          created_at: string
          definition_of_done: Json
          description: string | null
          energy_required: number | null
          goal: string | null
          human_owner: string | null
          id: string
          importance: number | null
          next_action: string | null
          next_action_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          title: string
          type: Database["public"]["Enums"]["ticket_type"]
          updated_at: string
          urgency: number | null
          user_id: string
          waiting_on: string | null
        }
        Insert: {
          agent_mode?: Database["public"]["Enums"]["agent_mode"]
          agent_status?: Database["public"]["Enums"]["agent_status"]
          closed_at?: string | null
          context?: string | null
          created_at?: string
          definition_of_done?: Json
          description?: string | null
          energy_required?: number | null
          goal?: string | null
          human_owner?: string | null
          id?: string
          importance?: number | null
          next_action?: string | null
          next_action_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title: string
          type?: Database["public"]["Enums"]["ticket_type"]
          updated_at?: string
          urgency?: number | null
          user_id: string
          waiting_on?: string | null
        }
        Update: {
          agent_mode?: Database["public"]["Enums"]["agent_mode"]
          agent_status?: Database["public"]["Enums"]["agent_status"]
          closed_at?: string | null
          context?: string | null
          created_at?: string
          definition_of_done?: Json
          description?: string | null
          energy_required?: number | null
          goal?: string | null
          human_owner?: string | null
          id?: string
          importance?: number | null
          next_action?: string | null
          next_action_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title?: string
          type?: Database["public"]["Enums"]["ticket_type"]
          updated_at?: string
          urgency?: number | null
          user_id?: string
          waiting_on?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_onboarding_tickets: { Args: never; Returns: number }
    }
    Enums: {
      agent_mode: "none" | "assist" | "semi_auto" | "auto"
      agent_status: "idle" | "running" | "awaiting_review" | "error"
      ticket_event_type:
        | "ticket_created"
        | "status_changed"
        | "note_added"
        | "agent_ran"
        | "agent_output_created"
        | "user_feedback_given"
        | "next_action_updated"
        | "artifact_created"
        | "participant_added"
        | "ticket_closed"
        | "ticket_dropped"
        | "field_updated"
      ticket_reference_kind:
        | "link"
        | "snippet"
        | "attachment"
        | "email"
        | "other"
      ticket_relation_type: "relates_to" | "blocked_by"
      ticket_status:
        | "inbox"
        | "active"
        | "waiting"
        | "follow_up"
        | "review"
        | "closed"
        | "dropped"
      ticket_type:
        | "task"
        | "research"
        | "decision"
        | "waiting"
        | "follow_up"
        | "admin"
        | "relationship"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      agent_mode: ["none", "assist", "semi_auto", "auto"],
      agent_status: ["idle", "running", "awaiting_review", "error"],
      ticket_event_type: [
        "ticket_created",
        "status_changed",
        "note_added",
        "agent_ran",
        "agent_output_created",
        "user_feedback_given",
        "next_action_updated",
        "artifact_created",
        "participant_added",
        "ticket_closed",
        "ticket_dropped",
        "field_updated",
      ],
      ticket_reference_kind: [
        "link",
        "snippet",
        "attachment",
        "email",
        "other",
      ],
      ticket_relation_type: ["relates_to", "blocked_by"],
      ticket_status: [
        "inbox",
        "active",
        "waiting",
        "follow_up",
        "review",
        "closed",
        "dropped",
      ],
      ticket_type: [
        "task",
        "research",
        "decision",
        "waiting",
        "follow_up",
        "admin",
        "relationship",
      ],
    },
  },
} as const
