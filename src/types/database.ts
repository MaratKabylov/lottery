export type Profile = {
  id: string;
  role: "admin" | "host";
  display_name: string | null;
  created_at: string;
};
export type Event = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_path: string | null;
  status: "draft" | "active" | "finished" | "archived";
  registration_enabled: boolean;
  draw_enabled: boolean;
  check_in_required: boolean;
  allow_multiple_wins: boolean;
  require_phone: boolean;
  require_email: boolean;
  show_participant_name: boolean;
  show_ticket_number: boolean;
  ticket_digits: number;
  sound_enabled: boolean;
  confetti_enabled: boolean;
  draw_animation_seconds: number;
  primary_color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type Participant = {
  id: string;
  event_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  ticket_number: number;
  checked_in: boolean;
  checked_in_at: string | null;
  is_active: boolean;
  is_test: boolean;
  created_at: string;
  updated_at: string;
};
export type Prize = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  quantity: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type Draw = {
  id: string;
  event_id: string;
  prize_id: string;
  participant_id: string;
  status: "pending" | "confirmed" | "cancelled";
  participants_count: number;
  created_by: string | null;
  drawn_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};
export type ScreenState = {
  event_id: string;
  mode: "waiting" | "countdown" | "drawing" | "winner" | "paused";
  current_prize_id: string | null;
  current_draw_id: string | null;
  countdown_end: string | null;
  updated_at: string;
};
export type PublicEvent = Pick<
  Event,
  | "id"
  | "name"
  | "slug"
  | "description"
  | "logo_path"
  | "primary_color"
  | "status"
  | "registration_enabled"
  | "require_phone"
  | "require_email"
  | "ticket_digits"
  | "check_in_required"
>;
export type ScreenSnapshot = {
  event: PublicEvent & Pick<Event, "confetti_enabled" | "sound_enabled">;
  state: ScreenState;
  participant_count: number;
  prize: Pick<Prize, "name" | "description" | "image_path"> | null;
  winner: {
    name: string | null;
    ticket_number: number | null;
    status: Draw["status"];
  } | null;
  server_time: string;
};
export type RegistrationResult = {
  success: true;
  participant_id: string;
  ticket_number: number;
  already_registered: boolean;
};
type Table<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};
export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      events: Table<Event>;
      participants: Table<Participant>;
      prizes: Table<Prize>;
      draws: Table<Draw>;
      event_screen_state: Table<ScreenState>;
    };
    Views: { public_event_view: { Row: PublicEvent; Relationships: [] } };
    Functions: {
      draw_winner: {
        Args: { p_event_id: string; p_prize_id: string };
        Returns: Draw;
      };
      confirm_draw: { Args: { p_draw_id: string }; Returns: Draw };
      cancel_draw: { Args: { p_draw_id: string }; Returns: Draw };
      get_public_screen: { Args: { p_slug: string }; Returns: ScreenSnapshot };
      staff_check_in: {
        Args: {
          p_event_id: string;
          p_ticket_number: number;
          p_checked_in: boolean;
        };
        Returns: Participant;
      };
      get_staff_stats: {
        Args: { p_event_id: string };
        Returns: {
          participants_count: number;
          checked_in_count: number;
          confirmed_winners_count: number;
        };
      };
      manage_test_participants: {
        Args: { p_event_id: string; p_count: number; p_remove: boolean };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
