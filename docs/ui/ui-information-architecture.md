# UI information architecture

The renderer entry point selects exactly one shell: Companion, Panel, or Creation. The Panel uses top-level navigation for Home, Chat, Discoveries, Journeys, Memories, Social, and Settings.

Social is no longer nested in Settings. It provides an overview, friend lookup, friends, requests, Visit invitations and current session, published Companion controls, and blocked users. Primary Friend actions remain visible; removal and block actions sit in an overflow menu and require confirmation.

Settings uses focused categories: Companion, AI, Voice, Privacy, Appearance, Online, Advanced, and Developer. Network URL and technical diagnostics are kept out of the primary Social account experience.

The Panel dashboard loads independent domains with `Promise.allSettled`, preserving available domains when another source fails and showing a retry notice for partial failures.
