# 05 - DATA MANAGEMENT

Version: 1.0

Status:
Draft

---

# Purpose

The Data Management System provides controlled manipulation of development data during Companion validation.

Its objective is to allow developers to quickly reset, seed, snapshot and restore Companion worlds without affecting production data.

Data Management is a validation utility.

It must never become part of the production Companion experience.

---

# Objectives

Data Management should allow developers to:

- Reset development data.
- Seed predefined datasets.
- Import validation worlds.
- Export current worlds.
- Create reusable snapshots.
- Restore previous validation states.

---

# Design Philosophy

Development should begin from a known state.

Instead of manually editing databases,

developers should restore a predefined validation world.

Every validation session should begin from a reproducible environment.

---

# Data Categories

CVK manages:

- Runtime Data
- Memory
- Notebook
- Journey
- Discovery
- Relationship
- Context
- Reflection
- Notification
- Companion Settings

Each category should be independently manageable.

---

# Reset Types

## Runtime Reset

Purpose

Restore runtime only.

Reset:

- Current State
- Queues
- Timers
- Temporary Cache
- Active Tasks

Preserve:

- Memory
- Notebook
- Journey
- Relationship

---

## Module Reset

Reset only one module.

Supported Modules

- Memory
- Discovery
- Journey
- Notebook
- Relationship
- Reflection
- Notification

Other modules remain unchanged.

---

## Validation Reset

Purpose

Restore the selected Scenario.

Process

Clear

↓

Seed

↓

Synchronize

↓

Resume Runtime

---

## Full Development Reset

Purpose

Return Companion to a clean installation.

Reset:

- Database
- Runtime
- Snapshots
- Temporary Files
- Cache

Generate:

Fresh Installation

Scenario

---

# Seed Data

CVK should include built-in datasets.

Examples

Fresh User

First Day

One Week

One Month

Heavy User

Large Notebook

Large Memory

AI Startup Journey

Each seed should be reproducible.

---

# Snapshot

Snapshots represent complete Companion worlds.

A Snapshot contains:

- Runtime
- Memory
- Discovery
- Journey
- Reflection
- Notebook
- Relationship
- Notifications
- Current Context

Snapshots should restore the entire environment.

---

# Snapshot Operations

Supported actions

Save Snapshot

Load Snapshot

Rename Snapshot

Delete Snapshot

Duplicate Snapshot

Compare Snapshot

Snapshots should remain lightweight whenever possible.

---

# Import / Export

Supported formats

JSON

Compressed Package

Versioned Scenario Package

Import should verify compatibility before loading.

---

# Migration

When schema changes occur,

CVK should attempt:

Upgrade

↓

Validate

↓

Load

If migration fails,

the Snapshot should remain untouched.

---

# Demo Worlds

CVK should provide reusable demo environments.

Examples

- Day 1
- Day 7
- Day 30
- One Year
- Heavy Discovery
- Relationship 90
- Empty Notebook
- Full Notebook

Demo Worlds should be version controlled.

---

---

# Snapshot Diff

CVK should compare two Snapshots.

Comparison should include:

- Runtime
- Memory
- Relationship
- Journey
- Notebook
- Discovery
- Reflection
- Notification Queue

The comparison should summarize meaningful changes instead of raw database differences.

---

# Safe Reset Pipeline

Reset operations should never directly clear databases.

Recommended flow:

Backup Snapshot

↓

Execute Reset

↓

Seed Validation World

↓

Synchronize Runtime

↓

Resume Companion

Developers should always be able to restore the previous Snapshot after a reset.

---

# Safety

Dangerous operations require confirmation.

Examples

Full Reset

Delete Snapshot

Database Clear

Confirmation should clearly describe:

- Data affected
- Recovery options
- Whether the operation is reversible

---

# Development Rules

Production builds must disable:

- Reset
- Seed
- Snapshot Editing
- Database Manipulation

Read-only inspection may remain available if explicitly enabled.

---

# Responsibilities

Data Management owns:

- Development data
- Seed management
- Snapshot management
- Validation worlds
- Reset operations

Data Management does NOT own:

- Business logic
- Runtime decisions
- Companion behavior
- Memory algorithms

---

# Developer Notes

Developers should avoid manually editing databases.

Instead:

Load

↓

Validate

↓

Modify

↓

Save Snapshot

↓

Share Snapshot

Validation environments should become project assets.

---

# Acceptance Criteria

A completed Data Management System should:

- Restore Companion worlds reliably.
- Reset modules independently.
- Support reusable snapshots.
- Enable reproducible validation.
- Protect production data from development tools.