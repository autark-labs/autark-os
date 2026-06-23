# Shell Home Discover Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved dark-blue reference style to the header bar, vertical nav, Home app sections, and basic Discover app cards without changing backend services.

**Architecture:** This is a frontend-only visual slice. Existing repositories, API contracts, routes, and canonical app state remain unchanged; repeated app-card visual language is implemented through existing React components and page composition.

**Tech Stack:** React, Vite, TypeScript, Tailwind CSS, shadcn/ui primitives, lucide-react icons.

---

### Task 1: Shell Header And Sidebar

**Files:**
- Modify: `frontend/src/layout/AppShell.tsx`
- Modify: `frontend/src/layout/Sidebar.tsx`
- Modify: `frontend/src/layout/SystemStatusHeader.tsx`

- [ ] Tighten the app shell grid to a narrow vertical nav that matches the reference.
- [ ] Restyle the header as a compact status bar with Docker and Tailscale pills plus current time.
- [ ] Keep existing status popovers and view mode controls wired to current state.

### Task 2: Home App Cards

**Files:**
- Modify: `frontend/src/components/project-os/ProjectOSComponents.tsx`
- Modify: `frontend/src/pages/OverviewPage/OverviewPage.tsx`

- [ ] Update `QuickAccessAppTile` to the My Apps reference shape with icon, menu affordance, concise description, and two action slots.
- [ ] Use the new tile for Home managed apps and pinned external services.
- [ ] Keep Open links and management/review routes functional.

### Task 3: Basic Discover Cards

**Files:**
- Modify: `frontend/src/pages/MarketplacePage/MarketplaceAppList.tsx`
- Modify: `frontend/src/pages/MarketplacePage/MarketplacePage.tsx`

- [ ] Add a compact `basic` card density for basic mode that matches `MarketplaceBasicIcons.png`.
- [ ] Keep advanced mode on the richer existing layout.
- [ ] Use the requested bright blue for active and primary install/review actions.

### Task 4: Verification

**Files:**
- Test existing frontend tests.

- [ ] Run `npm run typecheck` from `frontend/`.
- [ ] Run `node --test $(find src -name '*.test.mjs' | tr '\n' ' ')` from `frontend/`.
- [ ] Run a local browser smoke check for Home, Discover basic, and shell layout.
