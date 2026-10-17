#!/bin/sh
set -e
REMOTE_URL=$(cat "/mnt/host/d/talk to krisna/services/api/scratch/remote-url.tmp")
echo "Starting read-only dump of public corpus tables from remote Neon DB..."
pg_dump -d "$REMOTE_URL" --data-only \
  --table=mahabharata_sources \
  --table=gita_verses \
  --table=mahabharata_chunks \
  --table=mahabharata_child_chunks \
  --table=ingestion_checkpoints \
  -f /mnt/host/wsl/corpus_data.sql
echo "Dump complete. Size:"
ls -lh /mnt/host/wsl/corpus_data.sql
