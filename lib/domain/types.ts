export type UserProfile = {
  id: string;
  display_name: string | null;
  created_at: string;
};

export type Session = {
  id: string;
  user_id: string;
  status: "active" | "ended";
  focus_duration_sec: number;
  break_duration_sec: number;
  started_at: string;
  ended_at: string | null;
  created_at?: string;
};

export type FocusBlock = {
  id: string;
  user_id: string;
  session_id: string;
  focus_duration_sec: number;
  completed: boolean;
  focus_rating: number;
  started_at: string;
  ended_at: string;
  day_of_week: number;
  time_bucket: "morning" | "afternoon" | "evening" | "night";
  created_at?: string;
};

export type Recommendation = {
  recommended_focus_duration_sec: number;
  recommended_break_duration_sec: number;
  flow_likelihood: number;
  rationale: string;
  model_version: string;
};
