# Quick Start for Argent

Use this if you need a short execution path.

## Step 1

Audit current project.

Create:

```txt
docs/current-state-audit.md
```

## Step 2

Add shared models.

```txt
packages/shared/models
```

## Step 3

Add event bus.

```txt
packages/platform/event-bus
```

## Step 4

Add provider interfaces.

```txt
packages/providers/contracts
```

or use existing package style if the repo already has a better location.

## Step 5

Bridge existing flows with events.

Do not remove old behavior.

## Step 6

Document compatibility.

Create:

```txt
docs/architecture/current-to-target-map.md
```

## Step 7

Stop.

Do not implement full Discovery, Curiosity, Creator, Cloud, or Society in Volume 01.
