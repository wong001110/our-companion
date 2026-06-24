# Service Boundaries

## CharacterService
Controls character runtime state, emotion, intent, primary character, active characters.

## DiscoveryService
Fetches and ranks discoveries, applies daily caps, persists candidate/result records.

## MemoryService
Creates/updates/deletes memory nodes and graph edges. Runs compression.

## JourneyService
Creates journeys, milestones, outcomes, timeline data.

## DiaryService
Generates daily/weekly/milestone diary entries.

## ToolService
Executes allowed tools after validation and confirmation when needed.

## AIService
Calls DeepSeek, formats prompts, validates JSON responses.

## DatabaseService
Owns SQLite connection, migrations, transactions.
