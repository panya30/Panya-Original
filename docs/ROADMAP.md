# Panya Original — Roadmap

> Personal Brain First, Company Brain Later

**Last Updated**: 2026-01-25
**The Architect**: Modz
**The Alpha**: Robin 💃

---

## Vision

```
Panya = Your Personal AI Brain
        │
        ├── Remembers everything (with your permission)
        ├── Follows you everywhere (all devices)
        ├── Learns your patterns (automatically)
        └── Helps you think (not thinks for you)
```

---

## Strategy: Personal Brain First

```
Phase 1-4: Personal Brain (B2C)
           ├── Build for ourselves first
           ├── Prove the value
           └── Get it right

Phase 5+:  Company Brain (B2B)
           ├── Built on Personal Brain foundation
           ├── Organization features
           └── Team collaboration
```

**Why?**
- Simpler to build
- We are the first users (dogfooding)
- Foundation for everything else
- Faster iteration

---

## Phase 1: Core Memory (Week 1-2)

### Goal
Robin learns automatically from conversations and files.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Auto-index | Watch ψ/memory/ for changes, index automatically | P0 |
| Conversation capture | Extract insights from chat, save to learnings | P0 |
| Memory types | Structured types: fact, insight, preference, event | P1 |
| Hybrid search | FTS (keywords) + Vector (semantic) | P0 |

### Deliverables
- [ ] File watcher service
- [ ] Conversation insight extractor
- [ ] Memory schema (TypeScript types)
- [ ] Search API improvements

### Success Criteria
- New files indexed within 5 seconds
- Insights auto-extracted from conversations
- Search returns relevant results

---

## Phase 2: Cloud Sync (Week 3-4)

### Goal
Access your Panya from any device.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Panya ID | Unique identity, authentication | P0 |
| Cloud storage | Sync memories to cloud | P0 |
| Conflict resolution | Handle sync conflicts | P1 |
| Offline support | Work offline, sync when online | P2 |

### Tech Stack (Proposed)
- **Auth**: Clerk or Supabase Auth
- **Database**: Supabase (Postgres)
- **Vector**: pgvector or separate Chroma
- **Realtime**: Supabase Realtime

### Deliverables
- [ ] Auth system (Panya ID)
- [ ] Cloud database schema
- [ ] Sync service
- [ ] Offline queue

### Success Criteria
- Login with Panya ID
- Memories sync across devices
- Works offline, syncs when online

---

## Phase 3: Multi-Surface (Month 2)

### Goal
Same Panya, everywhere you are.

### Surfaces
| Surface | Technology | Priority |
|---------|------------|----------|
| Web app | Next.js (existing) | P0 |
| Mobile app | React Native or PWA | P0 |
| Desktop app | Tauri or Electron | P1 |
| Browser extension | Chrome/Firefox | P2 |
| CLI | Already exists | ✅ |

### Deliverables
- [ ] Mobile-friendly API
- [ ] Mobile app MVP
- [ ] Desktop app MVP
- [ ] Browser extension (basic)

### Success Criteria
- Use Panya on phone
- Use Panya on desktop
- Same memories everywhere

---

## Phase 4: Smart Features (Month 3)

### Goal
Your Panya knows you and helps proactively.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Pattern recognition | Detect habits, preferences | P0 |
| Proactive suggestions | "You usually do X now" | P1 |
| Context awareness | Know what you're doing | P1 |
| Smart reminders | Remind based on patterns | P2 |

### Deliverables
- [ ] Pattern detection algorithm
- [ ] Suggestion engine
- [ ] Context tracking
- [ ] Reminder system

### Success Criteria
- Panya notices your patterns
- Relevant suggestions without asking
- Feels like "it knows me"

---

## Phase 5+: Company Brain (Month 4+)

> Depends on Personal Brain being solid

### Features (Planned)
- Organization knowledge base
- Team Panyas collaboration
- Access control & permissions
- Company-wide search
- Onboarding assistance

### Not Starting Until
- Personal Brain MVP proven
- At least 10 active Personal Brain users
- Core architecture stable

---

## Knowledge Layers

```
Layer 0: UNIVERSAL
         ├── First Principles
         ├── Core Philosophy
         └── Everyone gets this

Layer 1: COMMUNITY (Opt-in)
         ├── Anonymized patterns
         ├── General learnings
         └── Users choose to share

Layer 2: ORGANIZATION (B2B, later)
         ├── Company knowledge
         └── Team only

Layer 3: PERSONAL (Private)
         ├── Your memories
         ├── Your preferences
         └── Never shared (default)
```

---

## Tech Stack

### Current (Robin)
```
- Runtime: Bun
- AI: Claude (Anthropic)
- Local DB: SQLite + FTS5
- Vector: ChromaDB
- Protocol: MCP
```

### Adding (Personal Brain)
```
- Auth: Clerk or Supabase Auth
- Cloud DB: Supabase (Postgres + pgvector)
- Sync: Supabase Realtime
- Mobile: React Native or PWA
- Desktop: Tauri
```

---

## Principles (How We Build)

1. **Question Everything** — Why this way? Is there simpler?
2. **Build to Understand** — Prototype first, perfect later
3. **Simplicity Over Complexity** — Minimum viable, not maximum
4. **Own Your Data** — Local-first, user controls
5. **Evolve, Don't Revolutionize** — Small steps, big progress

---

## Milestones

| Date | Milestone | Status |
|------|-----------|--------|
| 2026-01-25 | Project initialized | ✅ |
| Week 1 | Auto-indexing works | 🔄 |
| Week 2 | Conversation capture works | ⏳ |
| Week 4 | Cloud sync MVP | ⏳ |
| Month 2 | Mobile app MVP | ⏳ |
| Month 3 | Smart features | ⏳ |
| Month 4+ | Company Brain | ⏳ |

---

## Non-Goals (For Now)

- ❌ Company Brain features
- ❌ Multi-user collaboration
- ❌ Monetization
- ❌ Marketing
- ❌ Perfect UI

**Focus**: Make Personal Brain work great for us first.

---

*"First principles, not conventions"*

**The Architect**: Modz
**The Alpha**: Robin 💃
