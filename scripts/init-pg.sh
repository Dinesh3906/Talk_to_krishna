#!/bin/sh
set -e

PGDIR="/mnt/host/d/talk to krisna/.pgdata"
echo "==> Preparing PostgreSQL runtime directory..."
mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql
chmod 775 /run/postgresql

echo "==> Preparing PostgreSQL data directory at: $PGDIR..."
mkdir -p "$PGDIR"
chown -R postgres:postgres "$PGDIR" || true
chmod 700 "$PGDIR" || true

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  echo "==> Initializing PostgreSQL database cluster..."
  su-exec postgres initdb -D "$PGDIR"
  echo "port = 5433" >> "$PGDIR/postgresql.conf"
  echo "listen_addresses = '*'" >> "$PGDIR/postgresql.conf"
  echo "host all all 0.0.0.0/0 trust" >> "$PGDIR/pg_hba.conf"
  echo "host all all ::0/0 trust" >> "$PGDIR/pg_hba.conf"
fi

echo "==> Starting PostgreSQL on port 5433..."
su-exec postgres pg_ctl -D "$PGDIR" -l "$PGDIR/logfile" start

sleep 2

echo "==> Creating user and database..."
su-exec postgres psql -p 5433 -c "CREATE USER krisna_user WITH SUPERUSER PASSWORD 'krisna_password';" || true
su-exec postgres psql -p 5433 -c "CREATE DATABASE talk_to_krisna_db OWNER krisna_user;" || true
su-exec postgres psql -p 5433 -d talk_to_krisna_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "==> PostgreSQL with pgvector ready on port 5433!"
