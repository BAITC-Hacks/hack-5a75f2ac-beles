export interface Contractor {
  id: string;
  anon_name: string;
  categories: string[];
  city: string;
  price_from_kzt: number;
  event_formats: string[];
  languages: string[];
  max_hours: number | null;
  busy_dates: string[];
  description: string;
  synthetic: boolean;
  city_imputed?: boolean;
  price_imputed?: boolean;
}

export interface MatchResponse {
  status: "matched" | "no_category" | "no_match" | "error";
  matches: {
    contractor: Contractor;
    explanation: string;
  }[];
  message: string;
  explanation_source?: "openai" | "local";
  summary?: {
    total_in_category: number;
    eligible: number;
    excluded: {
      busy: number;
      budget: number;
      format: number;
      language: number;
      duration: number;
    };
  };
}
