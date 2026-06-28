import { useState, useCallback } from 'react';
import type { CompanionPersonality } from '@our-companion/shared';

export function useAnalyzePersonality() {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (description: string): Promise<CompanionPersonality | null> => {
    setAnalyzing(true);
    setError(null);

    try {
      const prompt = `Analyze this companion personality description and extract 8 traits as numbers 0-100.

Description: "${description}"

Return ONLY a JSON object with these exact keys:
{
  "energy": <0-100, how active/energetic>,
  "curiosity": <0-100, how curious/exploratory>,
  "sociability": <0-100, how talkative/social>,
  "diligence": <0-100, how hardworking/focused>,
  "playfulness": <0-100, how fun/playful>,
  "confidence": <0-100, how confident/bold>,
  "calmness": <0-100, how calm/relaxed>,
  "shyness": <0-100, how shy/reserved>
}

Default values if description is vague:
energy=50, curiosity=50, sociability=50, diligence=50, playfulness=50, confidence=50, calmness=50, shyness=30`;

      const result = await window.ourCompanion.ai.chat({ message: prompt });
      const text = result.message;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Could not parse personality from AI response');

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, number>;
      const clamp = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 50));

      const personality: CompanionPersonality = {
        energy: clamp(parsed.energy),
        curiosity: clamp(parsed.curiosity),
        sociability: clamp(parsed.sociability),
        diligence: clamp(parsed.diligence),
        playfulness: clamp(parsed.playfulness),
        confidence: clamp(parsed.confidence),
        calmness: clamp(parsed.calmness),
        shyness: clamp(parsed.shyness)
      };

      return personality;
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
