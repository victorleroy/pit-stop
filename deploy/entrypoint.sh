#!/bin/sh
set -e

# Replication is optional (ADR-002 D5): without a bucket, the service runs on its volume alone.
if [ -z "$LITESTREAM_S3_BUCKET" ]; then
  echo "LITESTREAM_S3_BUCKET is not set: running without replication, back up $DATABASE_FILE yourself"
  exec node service/dist/index.js
fi

# Empty lets Litestream find an AWS bucket's region; Cloudflare R2 wants "auto".
export LITESTREAM_S3_REGION="${LITESTREAM_S3_REGION:-}"
export LITESTREAM_S3_ENDPOINT="${LITESTREAM_S3_ENDPOINT:-}"
export LITESTREAM_S3_PATH="${LITESTREAM_S3_PATH:-pit-stop}"

# Restore on a cold volume, then run the service under continuous replication.
# An empty bucket is the normal first boot (-if-replica-exists exits 0); any other failure
# stops here, rather than starting an empty database that would then replicate over the real
# one.
if [ ! -f "$DATABASE_FILE" ]; then
  echo "No local database, attempting a restore from object storage"
  litestream restore -if-replica-exists "$DATABASE_FILE"
fi

exec litestream replicate -exec "node service/dist/index.js"
