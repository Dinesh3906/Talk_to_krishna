# 10,000 Mahabharata RAG Coverage Tests

This suite was generated from the supplied **The Complete Mahabharata Volume 1-12** PDF.

## Important

10,000 chatbot questions alone cannot prove that every word from a 6,808-page PDF is
present in a vector database. Semantic RAG retrieval is not a lossless archival test.

This suite is therefore designed as a **retrieval/grounding stress test**:
- the first 6,808 tests cover every PDF page at least once;
- the remaining 3,192 tests add varied retrieval/context questions distributed across
  the entire corpus;
- prompts require source grounding and source-location reporting;
- the suite deliberately avoids requiring the model to reproduce long passages.

For a true "first word to last word" completeness guarantee, the application should
also run a deterministic ingestion audit that compares the normalized source text
against the text actually stored in the database/chunks. That audit should report:
- source pages covered;
- empty/missing chunks;
- token/word coverage;
- duplicate chunks;
- gaps between adjacent chunks;
- failed embeddings;
- missing vector rows;
- metadata coverage;
- first/last source token checks.

## Files

- `mahabharata_10000_rag_tests.jsonl` — 10,000 machine-readable tests.
- `mahabharata_10000_rag_tests.csv` — same tests for spreadsheet/manual review.

## Suggested result fields for the runner

For each test, record:
- pass/fail;
- retrieved chunk IDs;
- source page(s);
- retrieval score;
- whether the answer is grounded;
- citation validity;
- hallucination flag;
- latency;
- model/provider;
- error category.

Do not call the corpus "100% covered" unless the deterministic ingestion audit
also passes.
