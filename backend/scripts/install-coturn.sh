#!/usr/bin/env bash
#
# One-shot coturn install + config for callnade.
#
# Run on the EC2 box (Ubuntu 22.04+) as root or via sudo:
#   sudo bash scripts/install-coturn.sh
#
# What it does:
#   - Installs the coturn package.
#   - Writes /etc/turnserver.conf using the use-auth-secret scheme
#     (matches what backend/src/utils/turnCreds.js produces).
#   - Points TLS at the existing Let's Encrypt cert for callnade.site
#     (we use the same cert nginx serves; no separate issuance needed).
#   - Adds an Let's Encrypt post-renew hook so coturn picks up the
#     refreshed cert automatically every ~60 days.
#   - Enables + starts the coturn service.
#
# After this script finishes, you still need to:
#   1. Open AWS security group ports (UDP 3478, TCP 3478, TCP 5349,
#      UDP 49152-65535).
#   2. Update backend/.env on this box with the same TURN_SECRET
#      printed at the bottom of this script, plus
#      TURN_HOST=callnade.site:3478, then `pm2 restart backend`.
#   3. Test with /api/v1/calls/ice-config — the response should
#      include a `turn:` entry with a fresh signed credential.

set -euo pipefail

DOMAIN="${TURN_DOMAIN:-callnade.site}"
SECRET="${TURN_SECRET_VALUE:-2960fcbdf4a23322186d2a22bfbfb418887cfcdead14219a960ab8edf7a0d176}"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

if [[ "$EUID" -ne 0 ]]; then
  echo "Please run as root (sudo bash $0)" >&2
  exit 1
fi

echo "==> installing coturn"
apt-get update -y >/dev/null
apt-get install -y coturn

echo "==> looking up public IP"
EXTERNAL_IP="$(curl -s -fsS https://checkip.amazonaws.com || true)"
if [[ -z "$EXTERNAL_IP" ]]; then
  echo "Couldn't auto-detect external IP. Set EXTERNAL_IP env var and rerun." >&2
  exit 1
fi
echo "    public IP: $EXTERNAL_IP"

echo "==> writing /etc/turnserver.conf"
cat >/etc/turnserver.conf <<EOF
# Managed by scripts/install-coturn.sh — edits here will be overwritten
# next time the script runs. Tweak the script and re-run instead.

# Network — listen on all interfaces; bind public IP for the relay.
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=${EXTERNAL_IP}

# Relay UDP port range. Open the SAME range in the AWS security group.
min-port=49152
max-port=65535

# Auth: shared-secret scheme. Backend mints
# username = "<expiry-unix>:<userId>" and credential = HMAC-SHA1.
# See backend/src/utils/turnCreds.js.
fingerprint
use-auth-secret
static-auth-secret=${SECRET}
realm=${DOMAIN}

# TLS — same Let's Encrypt cert nginx serves. Auto-refreshed via
# the post-renew hook installed below.
cert=${CERT}
pkey=${KEY}

# Hardening — block requests targeting our own internal services
# and disable features we don't need.
no-multicast-peers
no-cli
no-tlsv1
no-tlsv1_1
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.0.2.0-192.0.2.255
denied-peer-ip=192.88.99.0-192.88.99.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=198.51.100.0-198.51.100.255
denied-peer-ip=203.0.113.0-203.0.113.255
denied-peer-ip=240.0.0.0-255.255.255.255
allowed-peer-ip=${EXTERNAL_IP}
total-quota=100
stale-nonce=600

# Logs — systemd captures these via journalctl.
no-stdout-log
EOF

echo "==> enabling coturn service"
sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn \
  || echo 'TURNSERVER_ENABLED=1' >>/etc/default/coturn

echo "==> installing letsencrypt post-renew hook"
mkdir -p /etc/letsencrypt/renewal-hooks/post
cat >/etc/letsencrypt/renewal-hooks/post/coturn-restart.sh <<'HOOK'
#!/usr/bin/env bash
# Coturn keeps cert files open; reload doesn't pick up a fresh
# Let's Encrypt cert. Restart so it loads the new chain.
systemctl restart coturn || true
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/post/coturn-restart.sh

echo "==> giving coturn read access to the cert"
# Default cert perms only let root read privkey. Add coturn group so
# the daemon (which runs as turnserver:turnserver) can read it.
chgrp -R turnserver /etc/letsencrypt/live/ /etc/letsencrypt/archive/ || true
chmod -R g+rx /etc/letsencrypt/live/ /etc/letsencrypt/archive/ || true

echo "==> restarting coturn"
systemctl enable coturn
systemctl restart coturn
sleep 1
systemctl --no-pager --full status coturn | head -25 || true

cat <<DONE

==============================================================================
✅ coturn installed and running.

NEXT STEPS (do these manually):

1. AWS Security Group → inbound rules — add:
     UDP 3478              0.0.0.0/0     # TURN listening
     TCP 3478              0.0.0.0/0     # TURN listening
     TCP 5349              0.0.0.0/0     # TURN over TLS
     UDP 49152-65535       0.0.0.0/0     # relay range
   (Same group your EC2 instance uses for ports 22 / 80 / 443.)

2. Update backend/.env (don't commit), then restart backend:
     TURN_SECRET=${SECRET}
     TURN_HOST=${DOMAIN}:3478
     TURN_TTL_SEC=600

     pm2 restart backend
     pm2 logs backend --lines 20 --nostream

3. Test the credential mint:
     curl -s -X POST https://${DOMAIN}/api/v1/calls/ice-config \\
       -H "Authorization: Bearer <your-access-token>" | jq

   You should see a turn:${DOMAIN}:3478 entry with username + credential.

4. Optional sanity-check from your laptop (need turnutils-uclient
   on macOS: brew install coturn):
     turnutils_uclient -y -u <minted-username> -w <minted-credential> ${DOMAIN}
   It should print "Allocation succeeded" and start relaying packets.
==============================================================================
DONE
