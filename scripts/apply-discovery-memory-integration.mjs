import fs from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

const engineIndex = 'packages/discovery-engine/src/index.ts';
replaceOnce(
  engineIndex,
  "export { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay, getDiscoveryFetchDelayRange } from './timing';",
  "export { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay, getDiscoveryFetchDelayRange } from './timing';\nexport * from './discoveryMemory';",
  'discovery-engine export',
);

const services = 'apps/desktop/electron/main/services.ts';
replaceOnce(services, `  adjustDiscoveryModeWeights,\n  buildBoundedDiscoveryContext,`, `  adjustDiscoveryModeWeights,\n  attachDiscoveryMemoryAlignment,\n  buildBoundedDiscoveryContext,\n  buildDiscoveryMemoryProfile,`, 'discovery imports start');
replaceOnce(services, `  normalizeDiscoveryUrl,\n  normalizeDiscoveryBaseInput,`, `  normalizeDiscoveryUrl,\n  normalizeDiscoveryBaseInput,\n  rankDiscoveryCandidatesWithMemory,\n  readDiscoveryMemoryAlignment,\n  scoreCandidate,`, 'discovery imports ranking');
replaceOnce(services, `  clampScore,\n  createTimer,`, `  clampScore,\n  createTimer,\n  toUnitScore,`, 'shared score import');

replaceOnce(
  services,
  `      const name = primary.name;\n      const personalityDesc = \` Personality: \${primary.personalityDescription}\`;\n      const fallback = {\n        why_this_matters: \`\${input.discovery.title} matches \${name}'s curiosity around web, UX, and exploration.\`,\n        recommended_action: 'view' as const,\n        short_message: 'I found something that might be worth a small look.',\n        tags: input.discovery.tags\n      };`,
  `      const name = primary.name;\n      const personalityDesc = \` Personality: \${primary.personalityDescription}\`;\n      const memoryAlignment = readDiscoveryMemoryAlignment(input.discovery.raw);\n      const relevanceTopics = memoryAlignment?.publicHintTerms.slice(0, 4) ?? [];\n      const fallback = {\n        why_this_matters: relevanceTopics.length\n          ? \`\${input.discovery.title} connects with themes around \${relevanceTopics.join(', ')}.\`\n          : \`\${input.discovery.title} matches \${name}'s current curiosity.\`,\n        recommended_action: 'view' as const,\n        short_message: 'I found something that might be worth a small look.',\n        tags: input.discovery.tags\n      };`,
  'discovery reason memory context',
);
replaceOnce(services, `            '- If user memory/personality context exists, use it subtly.'`, `            '- Use relevanceTopics only as subtle themes; never quote or claim a specific Memory.\\n' +\n            '- Never say "I remember", "you said", or "based on your history".\\n' +\n            '- Never expose Memory IDs, internal scores, or private context.'`, 'discovery reason privacy rules');
replaceOnce(services, `            source: input.discovery.source,\n            tags: input.discovery.tags`, `            source: input.discovery.source,\n            tags: input.discovery.tags,\n            relevanceTopics`, 'discovery reason payload');

replaceOnce(
  services,
  `    const discoveryCandidates: DiscoveryCandidate[] = [];\n    const persistedSeen = this.db.listDiscoverySeenIdentities(companionId, 1_000);`,
  `    const discoveryMemoryProfile = buildDiscoveryMemoryProfile({\n      memoryNodes,\n      patterns: persistedPatterns,\n      interestGraph,\n      discoveries: discoveryHistory,\n      feedback: feedbackHistory,\n      generatedAt: evaluatedAt,\n    });\n    const rankedResearchCandidates = rankDiscoveryCandidatesWithMemory({\n      candidates: research.candidates,\n      profile: discoveryMemoryProfile,\n      mode: discoveryMode,\n      curiosityTarget: selectedCuriosityTarget,\n      activeCharacter: characterProfile,\n      baseScore: scoreCandidate,\n    });\n    const acceptedMemoryRanks = new Map<string, (typeof rankedResearchCandidates)[number]>();\n    trace(\n      'discovery',\n      'rank-memory-context',\n      rankedResearchCandidates.length === 0 ? 'empty' : 'completed',\n      [...discoveryMemoryProfile.sourceMemoryIds, ...discoveryMemoryProfile.sourcePatternIds, ...discoveryMemoryProfile.sourceInterestNodeIds],\n      rankedResearchCandidates.map((item) => item.candidate.id),\n    );\n    const discoveryCandidates: DiscoveryCandidate[] = [];\n    const persistedSeen = this.db.listDiscoverySeenIdentities(companionId, 1_000);`,
  'memory candidate ranking',
);
replaceOnce(services, `    for (const candidate of research.candidates) {`, `    for (const rankedCandidate of rankedResearchCandidates) {\n      const candidate = attachDiscoveryMemoryAlignment(rankedCandidate.candidate, rankedCandidate);`, 'ranked candidate loop');
replaceOnce(services, `      const accepted = dedup.outcome !== 'duplicate'\n        && !candidateSaturation.blocked`, `      const accepted = dedup.outcome !== 'duplicate'\n        && !rankedCandidate.alignment.blockedByBoundary\n        && !candidateSaturation.blocked`, 'boundary candidate gate');
replaceOnce(services, `          reason: dedup.outcome === 'duplicate'\n            ? \`\${dedup.reason}\${dedup.attachEvidenceOnly ? ':evidence_attached' : ''}\``, `          reason: rankedCandidate.alignment.blockedByBoundary\n            ? 'memory_boundary_blocked'\n            : dedup.outcome === 'duplicate'\n              ? \`\${dedup.reason}\${dedup.attachEvidenceOnly ? ':evidence_attached' : ''}\``, 'boundary rejection reason');
replaceOnce(services, `        this.db.insertDiscoveryCandidate(candidate);\n        discoveryCandidates.push(candidate);\n        discoveryInspection.candidatesAccepted.push(candidate.id);`, `        this.db.insertDiscoveryCandidate(candidate);\n        discoveryCandidates.push(candidate);\n        acceptedMemoryRanks.set(candidate.id, rankedCandidate);\n        discoveryInspection.candidatesAccepted.push(candidate.id);`, 'accepted memory rank cache');

replaceOnce(
  services,
  `      const sourceCandidate = [...discoveryCandidates].sort(\n        (left, right) =>\n          right.relevanceScore + right.noveltyScore + right.usefulnessScore\n          - (left.relevanceScore + left.noveltyScore + left.usefulnessScore)\n      )[0];`,
  `      const sourceCandidate = [...discoveryCandidates].sort(\n        (left, right) =>\n          (acceptedMemoryRanks.get(right.id)?.personalizedScore ?? scoreCandidate(right))\n          - (acceptedMemoryRanks.get(left.id)?.personalizedScore ?? scoreCandidate(left))\n      )[0];\n      const sourceMemoryRank = sourceCandidate ? acceptedMemoryRanks.get(sourceCandidate.id) : undefined;`,
  'memory-aware source selection',
);
replaceOnce(services, `      } catch {\n        sourceRaw = {};\n      }\n      const source: DiscoverySource`, `      } catch {\n        sourceRaw = {};\n      }\n      const sourceMemoryAlignment = readDiscoveryMemoryAlignment(sourceRaw);\n      const source: DiscoverySource`, 'read source memory alignment');
replaceOnce(services, `        tags: [selectedCuriosityTarget.topic],`, `        tags: [...new Set([selectedCuriosityTarget.topic, ...(sourceMemoryAlignment?.publicHintTerms ?? [])])].slice(0, 4),`, 'memory-aware discovery tags');
replaceOnce(services, `          discoveryBaseIds: Array.isArray(sourceRaw.discoveryBaseIds)\n            ? sourceRaw.discoveryBaseIds\n            : [],`, `          discoveryBaseIds: Array.isArray(sourceRaw.discoveryBaseIds)\n            ? sourceRaw.discoveryBaseIds\n            : [],\n          memoryAlignment: sourceRaw.memoryAlignment,`, 'persist discovery memory alignment');
replaceOnce(services, `        userInterestScore: 0.5,\n        userHistoryScore: 0.5,\n        characterExpertiseScore: 0.5,\n        noveltyScore: selectedInsight.novelty,\n        usefulnessScore: selectedInsight.importance,\n        finalScore: selectedInsight.confidence,`, `        userInterestScore: toUnitScore(((sourceMemoryAlignment?.memoryScore ?? 0.5) + (sourceMemoryAlignment?.interestScore ?? 0.5)) / 2),\n        userHistoryScore: sourceMemoryAlignment?.userHistoryScore ?? 0.5,\n        characterExpertiseScore: sourceMemoryAlignment?.expertiseScore ?? 0.5,\n        noveltyScore: selectedInsight.novelty,\n        usefulnessScore: selectedInsight.importance,\n        finalScore: toUnitScore(selectedInsight.confidence * 0.6 + (sourceMemoryRank?.personalizedScore ?? 0.5) * 0.4),`, 'real discovery scores');

replaceOnce(services, `    if (input.value === 'saved' && insight) {\n      const memory = this.db.insertMemoryNode({`, `    if (input.value === 'saved' && insight) {\n      const savedDiscovery = this.db.getDiscovery(insight.id);\n      const memory = this.db.insertMemoryNode({`, 'saved discovery lookup');
replaceOnce(services, `          content: insight.explanation,\n          source: 'autonomous_exploration'`, `          content: insight.explanation,\n          source: 'autonomous_exploration',\n          sourceUrl: savedDiscovery?.canonicalUrl ?? savedDiscovery?.url`, 'saved discovery memory source url');
