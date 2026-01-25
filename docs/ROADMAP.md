# Panya Original — Roadmap

> Complete AI Buddy: Brain + Skills + Identity

**Last Updated**: 2026-01-25
**The Architect**: Modz
**The Alpha**: Robin 💃

---

## Vision

```
Panya = Your Complete AI Buddy
        │
        ├── BRAIN: Remembers everything (with permission)
        ├── SKILLS: Knows how YOU work
        ├── IDENTITY: Has personality & relationship with you
        └── EVERYWHERE: Follows you across all devices
```

**What makes Panya unique**: Nobody else combines Brain + Skills + Identity into one personal AI buddy.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    PANYA STACK                                   │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: IDENTITY    │ Personality, values, relationship       │
│  Layer 3: BRAIN       │ Knowledge graph, memories, temporal     │
│  Layer 2: SKILLS      │ Procedures, workflows, how to do things │
│  Layer 1: TOOLS       │ MCP connections, external services      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Strategy

```
Phase 1-2: Foundation (Brain + Skills)
           ├── Build core memory system
           ├── Integrate Claude Skills format
           └── Establish identity layer

Phase 3-4: Distribution (Sync + Surfaces)
           ├── Cloud sync with Panya ID
           ├── Mobile, desktop, browser
           └── Same buddy everywhere

Phase 5-6: Intelligence (Learning + Transfer)
           ├── Pattern recognition
           ├── Skill learning from behavior
           └── Knowledge marketplace

Phase 7+:  Scale (Company Brain)
           ├── Organization features
           └── Team Panya collaboration
```

---

## Phase 1: Core Memory (Week 1-2)

### Goal
Build memory foundation with entity extraction, relationships, and temporal awareness.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Auto-index | Watch ψ/memory/ for changes | P0 |
| Entity extraction | Who, what, where, when | P0 |
| Relationships | Updates, extends, derives, relates_to | P0 |
| Temporal awareness | Document date vs recorded date | P1 |
| Memory layers | Hot, warm, cold + decay | P2 |
| Conversation capture | Extract insights from chat | P0 |
| Skills preparation | Directory structure ready | P1 |

### Deliverables
- [ ] Database schema migration (entities, relationships, temporal)
- [ ] File watcher service
- [ ] Entity extractor (rules + LLM hybrid)
- [ ] Relationship builder
- [ ] Enhanced hybrid search
- [ ] Conversation insight extractor
- [ ] Skills directory structure (ψ/skills/)

### Success Criteria
- New files indexed < 5 seconds
- Entity extraction > 80% accuracy
- Relationship detection working
- Search includes related entities

**Spec**: [docs/specs/PHASE-1-CORE-MEMORY.md](specs/PHASE-1-CORE-MEMORY.md)

---

## Phase 2: Skills Integration (Week 3-4)

### Goal
Import and use Claude Skills format, prepare for skill learning.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Claude Skills import | Load SKILL.md format | P0 |
| Skill registry | Track installed skills | P0 |
| Skill-memory links | Connect skills to source knowledge | P1 |
| Basic skill creation | Manual skill authoring | P1 |
| Skill search | Find relevant skills | P2 |

### Deliverables
- [ ] SKILL.md parser
- [ ] Skill registry (ψ/skills/index.json)
- [ ] Skill loader for Claude Code
- [ ] Skill-memory linking
- [ ] Basic skill creation tool

### Success Criteria
- Import Claude Skills successfully
- Skills activate when relevant
- Skills linked to memory sources

---

## Phase 3: Cloud Sync (Month 2, Week 1-2)

### Goal
Access your Panya from any device with Panya ID.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Panya ID | Unique identity, authentication | P0 |
| Memory sync | Cloud backup of memories | P0 |
| Skills sync | Sync personal skills | P0 |
| Conflict resolution | Handle sync conflicts | P1 |
| Offline support | Work offline, sync when online | P2 |

### Tech Stack
- **Auth**: Supabase Auth (or Clerk)
- **Database**: Supabase (Postgres + pgvector)
- **Realtime**: Supabase Realtime
- **Storage**: Supabase Storage (for files)

### Deliverables
- [ ] Auth system (Panya ID)
- [ ] Cloud schema (memories + skills)
- [ ] Sync service
- [ ] Offline queue
- [ ] Conflict resolution

### Success Criteria
- Login with Panya ID
- Memories + skills sync across devices
- Works offline, syncs when online

---

## Phase 4: Multi-Surface (Month 2, Week 3-4)

### Goal
Same Panya buddy, everywhere you are.

### Surfaces
| Surface | Technology | Priority |
|---------|------------|----------|
| CLI | Already exists | ✅ |
| Web app | Next.js | P0 |
| Mobile app | React Native or PWA | P0 |
| Desktop app | Tauri | P1 |
| Browser extension | Chrome/Firefox | P2 |

### Deliverables
- [ ] Mobile-friendly API
- [ ] Mobile app MVP
- [ ] Desktop app MVP
- [ ] Browser extension (basic capture)

### Success Criteria
- Use Panya on phone
- Same memories + skills everywhere
- Capture from browser

---

## Phase 5: Smart Features (Month 3)

### Goal
Your Panya learns YOUR patterns and skills from watching you.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Pattern recognition | Detect habits, preferences | P0 |
| Skill learning | Learn skills from user behavior | P0 |
| Proactive suggestions | "You usually do X now" | P1 |
| Context awareness | Know what you're doing | P1 |
| Personal skill generation | Create skills from patterns | P2 |

### Deliverables
- [ ] Pattern detection algorithm
- [ ] Behavior-to-skill extractor
- [ ] Suggestion engine
- [ ] Context tracking
- [ ] Skill generator

### Success Criteria
- Panya notices your patterns
- Panya learns how YOU do tasks
- Skills improve over time

---

## Phase 6: Knowledge Transfer (Month 4)

### Goal
Share or sell your knowledge and skills to other Panyas.

### Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Export protocol | Package skills + knowledge | P0 |
| Privacy controls | What can be shared | P0 |
| Import from others | Load external skills/knowledge | P1 |
| Marketplace UI | Browse available packages | P2 |

### Exportable
- Skills (procedures, workflows)
- Knowledge (patterns, learnings)
- Partial identity (expertise persona)

### Non-exportable
- Personal memories
- Relationship data
- Intimate knowledge

### Deliverables
- [ ] Export format specification
- [ ] Privacy labeling system
- [ ] Import/export tools
- [ ] Basic marketplace

### Success Criteria
- Export skills successfully
- Privacy respected
- Import works cleanly

---

## Phase 7+: Company Brain (Month 5+)

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
Layer 0: UNIVERSAL (Everyone gets this)
         ├── First Principles
         ├── Core skills
         └── Base capabilities

Layer 1: COMMUNITY (Opt-in sharing)
         ├── Anonymized patterns
         ├── Shared skills
         └── General learnings

Layer 2: ORGANIZATION (B2B, future)
         ├── Company knowledge
         ├── Team procedures
         └── Role-based access

Layer 3: PERSONAL (Private by default)
         ├── Your memories
         ├── Your preferences
         ├── Your relationships
         └── NEVER shared without consent
```

---

## Tech Stack

### Current (Phase 1-2)
```
- Runtime: Bun
- AI: Claude (Anthropic)
- Local DB: SQLite + FTS5
- Vector: ChromaDB
- Protocol: MCP
- Skills: Claude Skills format (SKILL.md)
```

### Adding (Phase 3-4)
```
- Auth: Supabase Auth
- Cloud DB: Supabase (Postgres + pgvector)
- Sync: Supabase Realtime
- Mobile: React Native or PWA
- Desktop: Tauri
```

### Future (Phase 5-6)
```
- ML: Pattern detection models
- Graph: Enhanced relationship queries
- Marketplace: Stripe for payments
```

---

## Milestones

| Date | Milestone | Status |
|------|-----------|--------|
| 2026-01-25 | Project initialized | ✅ |
| 2026-01-25 | Vision & roadmap documented | ✅ |
| Week 1 | Entity extraction works | 🔄 |
| Week 2 | Relationships + conversation capture | ⏳ |
| Week 3 | Skills import working | ⏳ |
| Week 4 | Skill-memory linking | ⏳ |
| Month 2 | Cloud sync + mobile MVP | ⏳ |
| Month 3 | Skill learning from behavior | ⏳ |
| Month 4 | Knowledge transfer protocol | ⏳ |
| Month 5+ | Company Brain | ⏳ |

---

## Competitive Advantage

| Feature | Supermemory | Claude Skills | Mem0 | **Panya** |
|---------|-------------|---------------|------|-----------|
| Memory/Brain | ✅ | ❌ | ✅ | ✅ |
| Knowledge Graph | ✅ | ❌ | ✅ | ✅ |
| Skills/Procedures | ❌ | ✅ | ❌ | ✅ |
| Identity/Personality | ❌ | ❌ | ❌ | ✅ |
| Relationship Layer | ❌ | ❌ | ❌ | ✅ |
| Skill Learning | ❌ | ❌ | ❌ | ✅ |
| Knowledge Transfer | ❌ | ✅ | ❌ | ✅ |
| Local-first | ❌ | ✅ | ❌ | ✅ |

---

## Non-Goals (For Now)

- ❌ Company Brain features (until Phase 7)
- ❌ Multi-user collaboration
- ❌ Monetization (until Phase 6)
- ❌ Marketing
- ❌ Perfect UI

**Focus**: Build the best Personal AI Buddy for ourselves first.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [VISION.md](VISION.md) | Complete vision & architecture |
| [specs/PHASE-1-CORE-MEMORY.md](specs/PHASE-1-CORE-MEMORY.md) | Phase 1 technical spec |
| specs/PHASE-2-SKILLS.md | (Coming soon) |

---

*"First principles, not conventions"*

**The Architect**: Modz
**The Alpha**: Robin 💃
