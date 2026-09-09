#!/bin/sh
# Generates this container's msmtp config (the `sendmail`-compatible binary `PostfixSendmailTransport`
# shells out to for outbound mail — see mail:transport:sendmail:path) before handing off to the real
# command. Written at container start, not build time, so the relay target can be overridden per
# deployment (e.g. a docker-compose override, or a Helm values change) without rebuilding the image.
set -e

RELAY_HOST="${SENDMAIL_RELAY_HOST:-postfix}"
RELAY_PORT="${SENDMAIL_RELAY_PORT:-25}"
RELAY_TLS="${SENDMAIL_RELAY_TLS:-off}"
FROM_ADDRESS="${SENDMAIL_FROM_ADDRESS:-mailer@localhost}"

MSMTPRC="${HOME:-/home/node}/.msmtprc"
cat > "$MSMTPRC" <<EOF
defaults
tls ${RELAY_TLS}
logfile -

account default
host ${RELAY_HOST}
port ${RELAY_PORT}
from ${FROM_ADDRESS}
EOF
chmod 600 "$MSMTPRC"

exec "$@"
