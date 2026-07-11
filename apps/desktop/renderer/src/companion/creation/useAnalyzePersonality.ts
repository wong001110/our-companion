import { useState, useCallback } from 'react';
import type { CompanionPersonalityAnalysis } from '@our-companion/shared';

export function useAnalyzePersonality() {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (description: string): Promise<CompanionPersonalityAnalysis | null> => {
    setAnalyzing(true);
    setError(null);

    try {
      return await window.ourCompanion.companionNew.analyzePersonality(description.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  return { analyze, analyzing, error };
}
