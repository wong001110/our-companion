import type { AppContext } from './appContext';
import type { CharacterRuntimeState, NormalizedDiscovery } from '@our-companion/shared';
import { advanceCharacter, applyEmotionEvent } from '@our-companion/character-engine';

export class CharacterApplicationService {
  constructor(private readonly ctx: AppContext) {}

  getState = async (characterId?: string) => this.ctx.db.getCharacterState(characterId);
  getActive = async () => this.ctx.db.getActiveCharacters();
  setPrimary = async (characterId: string) => this.ctx.db.setPrimaryCharacter(characterId);

  updatePosition = async (input: { characterId?: string; x: number; y: number }) => {
    const state = this.ctx.db.getCharacterState(input.characterId);
    const next = this.ctx.db.saveCharacterState({ ...state, position: { x: input.x, y: input.y } });
    return next;
  };

  triggerBehavior = async (input: { characterId?: string; event: string }) => {
    const state = this.ctx.db.getCharacterState(input.characterId);
    const next = advanceCharacter(state, {
      userCommand: input.event === 'user_command' ? input.event : undefined,
      availableDiscoveries: input.event === 'discovery' ? [{} as NormalizedDiscovery] : undefined,
      recentMemoryActivity: input.event === 'memory',
      reflectionDue: input.event === 'reflection',
      userActive: true
    });
    return this.ctx.db.saveCharacterState(next);
  };

  applyFeedback = (state: CharacterRuntimeState, feedbackType: string): CharacterRuntimeState => {
    return {
      ...state,
      emotion: applyEmotionEvent(state.emotion, feedbackType as Parameters<typeof applyEmotionEvent>[1])
    };
  };
}
