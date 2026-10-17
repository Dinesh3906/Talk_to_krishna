#!/bin/sh
set -e

EVAL_PGDIR="/mnt/host/wsl/eval_pgdata"
echo "==> Preparing PostgreSQL runtime directory..."
mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql
chmod 775 /run/postgresql

echo "==> Preparing evaluation data directory at: $EVAL_PGDIR..."
mkdir -p "$EVAL_PGDIR"
chown -R postgres:postgres "$EVAL_PGDIR"
chmod 700 "$EVAL_PGDIR"

if [ ! -f "$EVAL_PGDIR/PG_VERSION" ]; then
  echo "==> Initializing PostgreSQL 18 cluster..."
  su-exec postgres initdb -D "$EVAL_PGDIR"
  echo "port = 5433" >> "$EVAL_PGDIR/postgresql.conf"
  echo "listen_addresses = '*'" >> "$EVAL_PGDIR/postgresql.conf"
  echo "host all all 0.0.0.0/0 trust" >> "$EVAL_PGDIR/pg_hba.conf"
  echo "host all all ::0/0 trust" >> "$EVAL_PGDIR/pg_hba.conf"
else
  grep -q "port = 5433" "$EVAL_PGDIR/postgresql.conf" || echo "port = 5433" >> "$EVAL_PGDIR/postgresql.conf"
  grep -q "listen_addresses = '\*'" "$EVAL_PGDIR/postgresql.conf" || echo "listen_addresses = '*'" >> "$EVAL_PGDIR/postgresql.conf"
fi

echo "==> Starting PostgreSQL on port 5433..."
su-exec postgres pg_ctl -D "$EVAL_PGDIR" -l "$EVAL_PGDIR/logfile" start || true

sleep 2

echo "==> Creating user and disposable database..."
su-exec postgres psql -p 5433 -c "CREATE USER krisna_user WITH SUPERUSER PASSWORD 'krisna_password';" || true
su-exec postgres psql -p 5433 -c "CREATE DATABASE talk_to_krishna_eval_local OWNER krisna_user;" || true
su-exec postgres psql -p 5433 -d talk_to_krishna_eval_local -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "==> Native PostgreSQL 18 with pgvector is ready on port 5433!"
