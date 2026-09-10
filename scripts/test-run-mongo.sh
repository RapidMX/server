#!/bin/bash
COMPOSE="docker compose -f docker-compose.mongo.yml"
# auth-server lives in a different GitHub org/registry namespace (ghcr.io/rapidrest) and may not be
# pullable from this CI job without separate credentials - this smoke test only needs to confirm the
# `server` image itself builds and boots correctly, so bring up everything BUT auth-server explicitly
# (--no-deps skips the dependency graph's own auth-server pull that `server`'s depends_on would otherwise
# trigger).
$COMPOSE up -d --build --no-deps mongo redis rspamd clamav postfix-tls-init postfix server mta-bridge
startTime=`date +%s`

status=`$COMPOSE ps | grep server-1 | grep 'Up' | grep '(healthy)' | wc -l`
while [[ $status -ne 1 && `expr \`date +%s\` - $startTime` -lt 60 ]]; do
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
