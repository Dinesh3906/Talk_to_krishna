# Talk to Krishna — Corpus Data Classification

In accordance with the **Source of Truth & Knowledge Architecture Policy** (\docs/architecture/source-of-truth.md\), this directory contains **initial seed files and structural metadata**, NOT canonical scripture.

---

## 1. Data Classification Matrix

| File | Classification | Purpose | Canonical Authority |
|---|---|---|---|
| \The Complete Mahabharata Volume 1-12.pdf\ (Root) | **CANONICAL PRIMARY SOURCE** | Original translation and page references for the epic narrative. | **Primary Source Document** |
| \data/mahabharata/corpus/bhagavad_gita.json\ | **DERIVED SEED METADATA** | 29 verified canonical Sanskrit verses used exclusively by \gita-ingester.ts\ to populate PostgreSQL \gita_verses\. | PostgreSQL \gita_verses\ table |
| \data/mahabharata/corpus/mahabharata_episodes.json\ | **DERIVED STRUCTURAL METADATA** | Episode indexing used during corpus validation and initial indexing. | PostgreSQL \mahabharata_child_chunks\ |
| \data/mahabharata/corpus/parvas_overview.json\ | **DERIVED STRUCTURAL METADATA** | 18 Parva schema and boundary definitions used by \corpus-validator.ts\. | PostgreSQL \mahabharata_sources\ |

---

## 2. Operational Rules

1. **The Database is the Operational Knowledge Store:**
   The production conversational RAG pipeline does NOT read from this directory at runtime. All vector and full-text searches query \mahabharata_child_chunks\ and \gita_verses\ in PostgreSQL.
2. **Never Treat Derived JSON as Authoritative Scripture:**
   Any modification or enrichment to these JSON files does not alter canonical truth. New verses or passages must be ingested into PostgreSQL with immutable provenance.
