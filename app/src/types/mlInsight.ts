export interface MLInsight {
  confidenceScore: number;
  learnedVector: string;
  adaptationNote: string;
}

export interface NeuralState {
  behavioralVector: string;
  adaptiveWeights: {
    [key: string]: number;
  };
  deepInsightEnabled: boolean;
}
