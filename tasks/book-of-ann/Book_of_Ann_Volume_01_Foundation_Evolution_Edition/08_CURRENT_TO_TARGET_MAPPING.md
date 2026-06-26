# Current-to-Target Mapping

This file maps likely existing packages to the target architecture.

## ai-engine

Current likely role:
- model calls
- prompt execution
- completion generation

Target role:
- providers/llm

Migration:
1. Keep existing ai-engine package.
2. Wrap it behind `LlmProvider`.
3. Remove direct model-specific imports from brain modules.
4. Later rename or move when stable.

## discovery-engine

Current likely role:
- internet discovery
- recommendation
- possibly LLM summary

Target role:
- brain/thinking/discovery
- receives Signal, outputs Discovery

Migration:
1. Extract Signal model.
2. Make discovery-engine accept Signal input.
3. Move source fetching out to perception/source providers.
4. Add deduplication boundary.

## character-engine

Current likely role:
- animation
- state
- behavior

Target role:
- character/*

Migration:
1. Preserve existing animation behavior.
2. Add character state model.
3. Separate emotion, behavior, and animation policy.
4. Prevent character-engine from executing business logic.

## speech-engine

Current likely role:
- bubble text
- speech output

Target role:
- expression/speech

Migration:
1. Keep as expression module.
2. Input should be CompanionDecision + CharacterState.
3. Output should be speech payload, not business action.

## tool-engine

Current likely role:
- tools and desktop actions

Target role:
- action/executor

Migration:
1. Split command execution from performance animation.
2. Add ActionPlanner.
3. Add PerformanceDirector.
4. Never rely on fake UI clicks for real execution.

## memory-engine

Current likely role:
- user memory

Target role:
- brain/knowledge/memory

Migration:
1. Define Memory, Knowledge, Concept, Journey boundaries.
2. Keep existing storage.
3. Add event listeners.
4. Add decay/archive policy later.

## journey-engine

Target role:
- brain/knowledge/journey

Migration:
1. Ensure Journey stores concepts and insights, not only saved links.
2. Add Journey lifecycle states.

## diary-engine

Target role:
- brain/reflection

Migration:
1. Keep diary.
2. Add daily reflection event flow.
3. Link reflection to journey and knowledge.

## curiosity-engine

Target role:
- brain/curiosity

Migration:
1. Keep as key brain module.
2. Ensure it does not directly control UI.
3. Output curiosity signals and gap matches.

## pattern-engine / insight-engine

Target role:
- brain/thinking

Migration:
1. Preserve modules.
2. Make them operate on Concepts and DiscoveryClusters.
3. Emit events instead of directly updating UI.
