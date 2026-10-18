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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      food_listings: {
        Row: {
          category: string
          description: string | null
          latitude: number | null
          longitude: number | null
          photo_metadata: Json | null
          photo_uploaded_at: string | null
          tags: string[]
          photo_path: string | null
          food_analysis: Json | null
          created_at: string
          donor_id: string
          expiry_time: string
          food_name: string
          id: string
          location: string
          notes: string | null
          original_quantity: number
          quantity: number
          status: string
        }
        Insert: {
          category?: string
          description?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_metadata?: Json | null
          photo_uploaded_at?: string
          tags?: string[]
          photo_path?: string | null
          food_analysis?: Json | null
          created_at?: string
          donor_id: string
          expiry_time: string
          food_name: string
          id?: string
          location: string
          notes?: string | null
          original_quantity?: number
          quantity: number
          status?: string
        }
        Update: {
          category?: string
          description?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_metadata?: Json | null
          photo_uploaded_at?: string
          tags?: string[]
          photo_path?: string | null
          food_analysis?: Json | null
          created_at?: string
          donor_id?: string
          expiry_time?: string
          food_name?: string
          id?: string
          location?: string
          notes?: string | null
          original_quantity?: number
          quantity?: number
          status?: string
        }
        Relationships: []
      }
      pickup_slots: {
        Row: {
          capacity: number
          created_at: string
          ends_at: string
          id: string
          interval_unit: Database['public']['Enums']['pickup_interval']
          listing_id: string
          starts_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          ends_at: string
          id?: string
          interval_unit?: Database['public']['Enums']['pickup_interval']
          listing_id: string
          starts_at: string
        }
        Update: {
          capacity?: number
          created_at?: string
          ends_at?: string
          id?: string
          interval_unit?: Database['public']['Enums']['pickup_interval']
          listing_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_slots_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "food_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      food_requests: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          notes: string | null
          pickup_confirmed_at: string | null
          status_note: string | null
          status_note_author: string | null
          quantity: number
          receiver_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          notes?: string | null
          pickup_confirmed_at?: string | null
          status_note?: string | null
          status_note_author?: string | null
          quantity?: number
          receiver_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          notes?: string | null
          pickup_confirmed_at?: string | null
          status_note?: string | null
          status_note_author?: string | null
          quantity?: number
          receiver_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "food_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      request_pickup_allocations: {
        Row: {
          active: boolean
          pickup_slot_id: string
          quantity: number
          request_id: string
        }
        Insert: {
          active?: boolean
          pickup_slot_id: string
          quantity: number
          request_id: string
        }
        Update: {
          active?: boolean
          pickup_slot_id?: string
          quantity?: number
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_pickup_allocations_pickup_slot_id_fkey"
            columns: ["pickup_slot_id"]
            isOneToOne: false
            referencedRelation: "pickup_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_pickup_allocations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "food_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reserve_food: {
        Args: { p_allocations: Json; p_listing_id: string; p_notes?: string; p_quantity: number }
        Returns: Database["public"]["Tables"]["food_requests"]["Row"]
      }
      create_food_listing_with_slots: {
        Args: {
          p_food_analysis: Json
          p_expiry_time: string
          p_food_name: string
          p_location: string
          p_notes: string
          p_photo_path: string
          p_pickup_blocks: Json
          p_quantity: number
        }
        Returns: Database["public"]["Tables"]["food_listings"]["Row"]
      }
      get_available_pickup_slots: {
        Args: { p_listing_id: string }
        Returns: {
          allocated: number
          capacity: number
          created_at: string
          ends_at: string
          id: string
          listing_id: string
          remaining: number
          starts_at: string
        }[]
      }
      replace_listing_pickup_slots: {
        Args: { p_listing_id: string; p_new_slots: Json; p_remove_ids: string[] }
        Returns: Database["public"]["Tables"]["pickup_slots"]["Row"][]
      }
      update_food_listing_details: {
        Args: { p_expiry_time: string; p_food_name: string; p_listing_id: string; p_location: string; p_notes: string; p_total_quantity: number }
        Returns: Database["public"]["Tables"]["food_listings"]["Row"]
      }
      advance_food_request: {
        Args: { p_direction: string; p_note?: string; p_request_id: string }
        Returns: Database["public"]["Tables"]["food_requests"]["Row"]
      }
      cancel_food_request: {
        Args: { p_note?: string; p_request_id: string }
        Returns: Database["public"]["Tables"]["food_requests"]["Row"]
      }
      confirm_food_pickup: {
        Args: { p_note?: string; p_request_id: string }
        Returns: Database["public"]["Tables"]["food_requests"]["Row"]
      }
      decline_food_request: {
        Args: { p_note?: string; p_request_id: string }
        Returns: Database["public"]["Tables"]["food_requests"]["Row"]
      }
      undo_food_request_decline: {
        Args: { p_request_id: string }
        Returns: Database["public"]["Tables"]["food_requests"]["Row"]
      }
      get_public_impact_metrics: {
        Args: Record<PropertyKey, never>
        Returns: {
          total_donors: number
          total_meals_saved: number
          total_recipients: number
        }[]
      }
    }
    Enums: {
      pickup_interval: '15_minutes'
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
