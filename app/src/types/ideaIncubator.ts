export interface IdeaArtifact {
  id: string;
  conceptName: string;
  vertical: 'software' | 'service-architecture' | 'digital-leverage' | 'low-overhead';
  confidenceScore: number;
  executiveSummary: string;
  feasibilityRating: number; // 0-1
  capitalRequirements: 'low' | 'moderate' | 'high';
  matchingSignals: string[]; // e.g., ["Recent AI Research Paper X", "Last 10 interactions pattern Y"]
  timestamp: string;
}

export interface IncubatorState {
  isPrivateMode: boolean;
  activeIdea: IdeaArtifact | null;
}
