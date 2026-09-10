#!/bin/bash
COMPOSE="docker compose -f docker-compose.sql.yml"
# auth-server lives in a different GitHub org/registry namespace (ghcr.io/rapidrest) and may not be
# pullable from this CI job without separate credentials - this smoke test only needs to confirm the
# `server` image itself builds and boots correctly, so bring up everything BUT auth-server explicitly
# (--no-deps skips the dependency graph's own auth-server pull that `server`'s depends_on would otherwise
# trigger).
$COMPOSE up -d --build --no-deps postgres redis rspamd clamav postfix-tls-init postfix server mta-bridge
startTime=`date +%s`

# 120s, not 60 - Postgres's own first-boot initdb (plus the app's TypeORM synchronize pass once it can
# connect) is slower than Mongo's equivalent cold start, confirmed live: a real run took a bit over 60s
# to reach healthy with nothing actually wrong, this timeout window had just never been exercised for
# real before now (see the -f flag fix above).
status=`$COMPOSE ps | grep server-1 | grep 'Up' | grep '(healthy)' | wc -l`
while [[ $status -ne 1 && `expr \`date +%s\` - $startTime` -lt 120 ]]; do
  sleep 1
  echo "Checking server status..."
  $COMPOSE ps
  status=`$COMPOSE ps | grep server-1 | grep 'Up' | grep '(healthy)' | wc -l`
done
if [[ $status -eq 1 ]]
then
    echo -e "\e[32mService started successfully.\e[0m"
	exitCode=0
else
    echo -e "\e[31mService failed to start.\e[0m"
	exitCode=1
fi
$COMPOSE down --rmi local
exit $exitCode
