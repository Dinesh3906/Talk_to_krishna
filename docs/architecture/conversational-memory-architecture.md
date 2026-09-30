# Talk to Krishna — Stateful Conversational Memory & Continuity Architecture

## 1. Executive Summary

This document specifies the industrial-grade, multi-tier conversational memory and continuity architecture for **Talk to Krishna**. It shifts the system from a naive, stateless `Question -> RAG -> Long Monologue` pipeline to a context-aware, stateful dialogue architecture:

```
USER MESSAGE
    │
    ▼
Context / Reference Understanding (Pronouns, Ellipses, Entity Disambiguation)
    │
    ▼
Current Conversation State (Active Topic, Subtopic, Established Facts, Themes)
    │
    ▼
Memory Retrieval (Fast path: Working Memory; Slow path: Historical Segments / Turns)
    │
    ▼
Intent & Response Mode Classification (Follow-up, Story, Recall, Banter, Philosophy)
    │
    ▼
Contextualized RAG (Contextual query formulation, evidence gating, zero-hallucination)
    │
    ▼
Response Planner (Adaptive depth, anti-repetition filter, new information focus)
    │
    ▼
Adaptive Krishna Response Generation (Streaming, authentic persona)
    │
    ▼
Asynchronous Incremental Memory Update (State, Topic Segments, Working Summary)
```

---

## 2. Multi-Tier Hierarchical Memory Architecture

Conversation memory operates across four complementary tiers, isolated strictly by `user_id` and `conversation_id`:

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: RECENT TURN MEMORY                                            │
│ - Last 6–12 immediate conversational turns                             │
│ - Highest priority context: preserves pronouns, tone, flow, context     │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 2: WORKING CONVERSATION MEMORY                                   │
│ - Structured ConversationState in PostgreSQL (table: conversation_states)│
│ - Active topic, subtopic, active entities, unresolved & discussed Qs   │
│ - Established facts, philosophical themes, incremental working summary │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: TOPIC SEGMENTATION (LONG-TERM CHAT MEMORY)                    │
│ - Explicit topic segments in PostgreSQL (table: conversation_segments) │
│ - Identifies topic shifts vs. continuations vs. topic restorations    │
│ - Preserves segment boundaries: startTurn, endTurn, key facts, summary │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 4: SEMANTIC CONVERSATION MEMORY                                  │
│ - Hybrid search over conversation segments & past turns                │
│ - Lexical GIN (tsvector) + dense HNSW vector(768) embeddings           │
│ - Triggered on historical recall or cross-topic references             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Architectural Subsystems

### 3.1 Reference & Pronoun Resolver (`reference-resolver.ts`)
- Resolves anaphoric pronouns:
  - Subject/Object pronouns: *he, she, him, her, they, them, it*
  - Demonstratives: *this, that, these, those, after that*
  - Inquiries & Ellipses: *why did he, what about him, what happened next, who told him, wasn't he aware*
- Binds pronouns to the most salient active entity in `ConversationState` or the immediate prior assistant message.
- Distinguishes 2nd person pronouns (*you, your*) addressing Krishna from 3rd person epic figures.

### 3.2 Contextual Query Resolver (`contextual-query-resolver.ts`)
- Prevents raw conversational noise from polluting RAG vector search.
- Rewrites elliptical questions into precise search queries:
  - Input: *"Wasn't he aware that Krishna knew his identity?"* (Active character: Karna)
  - Resolved Query: *"Karna awareness that Krishna knew his real identity before Kurukshetra war"*
- Bypasses RAG completely when:
  - User is performing **historical chat recall** (*"What did I ask you about Arjuna at the beginning?"*)
  - User is engaged in **casual greeting / banter** (*"How are you?", "Tell me a joke"*)
  - User is continuing with pure **philosophical discernment** without requiring fresh scripture citations.

### 3.3 Topic Segmentation & Restoration Flow
- **Topic Continuation**: User continues questioning on active topic/character -> increments turns on active segment.
- **Topic Shift**: User introduces a new subject (*"Tell me about Bhishma"* after discussing Arjuna) -> closes prior segment with summary & key facts; opens new segment.
- **Topic Return**: User signals restoration (*"Coming back to Arjuna..."*) -> retrieves prior segment from `conversation_segments`, restores active topic and established facts, and acknowledges the return naturally.

### 3.4 Historical Chat Recall Engine (`chat-memory-retriever.ts`)
- Answers questions about previous parts of the SAME conversation:
  - *"What did I ask you earlier about Arjuna?"*
  - *"What were we discussing before Karna?"*
  - *"Do you remember what I asked at the beginning?"*
- Queries `conversation_segments` and `messages` matching the specified entity/topic.
- **Strict Anti-Fabrication Rule**: If no earlier discussion exists, Krishna responds honestly:
  *"Earlier in this chat, we haven't discussed that yet."*
  Never hallucinates conversation history.

### 3.5 Response Planner & Dynamic Depth Policy (`response-planner.ts`)
Before calling the LLM, the system computes a structured execution plan:
1. `responseMode`:
   - `direct_followup`: Direct, concise answer building on established context.
   - `explanation`: Focused conceptual elaboration.
   - `story`: Living narrative when explicitly requested or necessary.
   - `philosophical`: Rigorous ethical and dharmic inquiry.
   - `clarification`: Addressing misconceptions directly.
   - `emotional_guidance`: Warm, companion presence.
   - `historical_recall`: Accurate summary of earlier chat turns.
   - `topic_shift`: Clean transition to new subject.
   - `casual_conversation`: Natural, warm banter without lectures.
2. `responseDepth`:
   - `very_short` (20–50 words): Simple greetings, "Why?", "What happened?".
   - `short` (40–100 words): Follow-up clarifications, direct questions.
   - `moderate` (100–180 words): Standard philosophical or contextual inquiries.
   - `detailed` (160–260 words): Complex ethical dilemmas or story requests.
   - `comprehensive` (240–380 words): Initial foundational questions or "explain everything".
3. `newInformationRequired` vs. `previousInformationToAvoidRepeating`:
   - Enforces the continuation rule: *What is NEW in this turn?*

### 3.6 Anti-Repetition Guard (`anti-repetition-guard.ts`)
- Compares generated response with the last 2 assistant responses.
- Detects repeated background introductions (e.g. *"Arjuna was one of the greatest warriors..."*), repeated paragraph structures, and identical conclusions.
- Compresses and replaces repetitive boilerplate with fluid conversational continuity language.

---

## 4. Chat Memory vs. Knowledge Memory Separation

| Dimension | Conversation Memory | Knowledge Memory (Mahabharata RAG) |
| :--- | :--- | :--- |
| **Question Answered** | *"What did you and I discuss earlier?"* | *"What does the Mahabharata canonical corpus say?"* |
| **Data Source** | `messages`, `conversation_states`, `conversation_segments` | `mahabharata_chunks`, `mahabharata_child_chunks`, `gita_verses` |
| **Search Space** | Scoped strictly to `(user_id, conversation_id)` | Global canonical corpus (768-dim BGE vector + tsvector) |
| **Lifecycle** | Dynamically updated per conversational turn | Pre-indexed canonical database |
| **Grounding Role** | Resolves context, references, pronouns, and intent | Supplies factual quotes, parva, chapter, and characters |

---

## 5. Multi-User & Multi-Chat Isolation

All database queries and memory lookups enforce strict composite boundaries:
```sql
WHERE conversation_id = $conversation_id AND user_id = $user_id
```
- No cross-talk between conversations of the same user.
- Zero data leakage between distinct users.

---

## 6. Performance & Latency Targets

- **Fast Path (90% of turns)**:
  - In-memory recent turns (6–12) + working conversation state.
  - Contextual query rewrite: < 5ms.
  - Hybrid RAG retrieval (if needed): < 35ms.
  - LLM first token TTFT: < 450ms.
- **Slow Path (10% of turns)**:
  - Historical memory retrieval across past segments: < 25ms.
  - Asynchronous background updates (state update, segment persistence): 0ms added to user response path.
