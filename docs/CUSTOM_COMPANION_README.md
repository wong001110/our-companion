# Custom Companion System README

## Purpose

This document defines the architecture of the Custom Companion System.

The goal is to support multiple companions instead of a single built-in character (Ann), while keeping user data isolated from application assets.

---

# Core Principles

1. The application must support multiple companions.
2. Every companion owns its own profile, assets, memories and runtime state.
3. Built-in companions and user-created companions are separated.
4. User-generated content must never be stored inside the project source.
5. All runtime systems must use the currently active companion instead of assuming Ann.

---

# Companion Lifecycle

## First Launch

If no companion exists:

```
Launch App
        ↓
No Companion
        ↓
Companion Creation Page
        ↓
Create Companion
        ↓
Set Active Companion
        ↓
Enter Main Runtime
```

---

## Existing User

```
Launch App
        ↓
Companion Selection
        ↓
Choose Companion
        ↓
Enter Runtime
```

Users should be able to:

* Create Companion
* Edit Companion
* Delete Companion
* Duplicate Companion
* Switch Active Companion

---

# Companion Model

Each companion should contain:

```ts
interface Companion {
    id: string;
    name: string;
    description: string;

    personalityPrompt: string;

    personalityScores: {
        energy: number;
        curiosity: number;
        sociability: number;
        diligence: number;
        playfulness: number;
        confidence: number;
        calmness: number;
        shyness: number;
    };

    assetRoot: string;

    createdAt: number;
    updatedAt: number;
}
```

---

# Companion Storage

## Built-in Companion

These belong to the application.

Example:

```
assets/
    companions/
        ann/
```

Built-in assets are read-only.

They must never be modified directly.

---

## User Companion

User companions should be stored inside Electron's userData directory.

Do NOT store them inside the project repository.

Example:

```
<App User Data>

companions/
    5a83f9ab/
        profile.json
        personality.json

        assets/
            sprites/
            animations/
            portraits/
            icons/

        memory/
        cache/
```

Every companion owns its own folder.

---

# Asset System

Each companion loads assets from:

```
companion.assetRoot
```

NOT

```
assets/companions/ann/
```

Hardcoded Ann paths should be removed.

Future asset replacement should simply replace files inside the companion's asset folder.

---

# Runtime Isolation

Avoid global Ann-only storage.

Bad

```
ann_position
ann_onboarded
ann_uiLang
```

Good

```
companion:{id}:position
companion:{id}:window
companion:{id}:onboarded
companion:{id}:language
companion:{id}:preferences
```

Every companion owns:

* desktop position
* onboarding progress
* memories
* personality
* settings
* assets
* runtime state

---

# Main Runtime

After selecting a companion:

```
activeCompanion
        ↓
Companion Runtime
        ↓
Companion Canvas
        ↓
Discovery
        ↓
Memory
        ↓
Conversation
```

Every runtime module should obtain data from the active companion.

Never assume Ann is active.

---

# Personality Integration

The following systems should eventually read:

```
activeCompanion.personalityScores
```

Including:

* idle selection
* walk selection
* talk animation
* discovery behaviour
* dialogue tone
* curiosity frequency
* notification style

Current MVP only needs to store the values.

Behaviour integration can be expanded later.

---

# Asset Replacement

Future customization page should support:

* Replace portrait
* Replace sprite sheet
* Replace idle animations
* Replace walk animations
* Replace talk animations
* Replace icons

This updates files inside the companion's asset folder.

No application assets should be modified.

---

# Built-in Companion Rules

Built-in companions (such as Ann):

* cannot be modified directly
* cannot overwrite built-in assets

If users edit a built-in companion:

```
Ann
    ↓
Clone
    ↓
User Companion
    ↓
Editable
```

---

# Git Rules

User-generated companions must never be committed into Git.

If a local development folder is used, ignore it.

Example:

```
user-data/
```

.gitignore

```
user-data/
*.cache
*.tmp
```

If Electron's userData directory is used, no additional Git configuration is required because user data is stored outside the repository.

---

# MVP Scope

Required

* Companion Creation
* Companion Selection
* Companion Editing
* Companion Deletion
* Active Companion Switching
* Companion-specific storage
* Companion-specific assetRoot
* Runtime isolation

Not Required Yet

* Asset Marketplace
* Spine Support
* Animation Editor
* Cloud Sync
* Community Sharing
* One-click Import/Export
* Asset Package Installer

---

# Long-term Goal

The application should treat every companion as an independent AI companion.

Changing companions should feel equivalent to switching to another individual with different assets, memories, personality, behaviours and runtime state, without affecting other companions.
