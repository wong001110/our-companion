import type { DatabaseService } from '@our-companion/database';
import type { CharacterContractSource } from './CharacterContractBuilder';

/** Resolves only existing profile/rule storage; legacy records get builder defaults. */
export function resolveCharacterContractSource(db: DatabaseService, companionId: string): CharacterContractSource {
  const companion = db.getCompanion(companionId);
  if (!companion) throw new Error('COMPANION_NOT_FOUND');
  const rules = db.getCharacterBehaviorRules(companionId);
  const values = Array.isArray(rules.values) ? rules.values.filter((value): value is string => typeof value === 'string') : undefined;
  const decisionPrinciples = Array.isArray(rules.decisionPrinciples) ? rules.decisionPrinciples.filter((value): value is string => typeof value === 'string') : undefined;
  const hardContradictions = Array.isArray(rules.hardContradictions) ? rules.hardContradictions.filter((value): value is string => typeof value === 'string') : undefined;
  const privacyRules = Array.isArray(rules.privacyRules) ? rules.privacyRules.filter((value): value is string => typeof value === 'string') : undefined;
  const tone = Array.isArray(rules.voiceTone) ? rules.voiceTone.filter((value): value is string => typeof value === 'string') : undefined;
  return { companionId, name: companion.name, personalityDescription: companion.personalityDescription, personality: companion.personality, speakingStyle: { tone, verbosity: rules.verbosity === 'brief' || rules.verbosity === 'balanced' || rules.verbosity === 'detailed' ? rules.verbosity : undefined, typicalPatterns: Array.isArray(rules.typicalPatterns) ? rules.typicalPatterns.filter((value): value is string => typeof value === 'string') : undefined, avoidPatterns: Array.isArray(rules.avoidPatterns) ? rules.avoidPatterns.filter((value): value is string => typeof value === 'string') : undefined }, values, behaviorRules: { decisionPrinciples, hardContradictions }, privacyRules, knowledgePolicy: { mayUseGeneralKnowledge: typeof rules.mayUseGeneralKnowledge === 'boolean' ? rules.mayUseGeneralKnowledge : undefined, uncertaintyPolicy: typeof rules.uncertaintyPolicy === 'string' ? rules.uncertaintyPolicy : undefined } };
}
