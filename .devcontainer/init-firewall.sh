#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT

iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

ipset create allowed-domains hash:net

echo "Resolving allowed domains..."
for domain in \
    "api.anthropic.com" \
    "statsig.anthropic.com" \
    "statsig.com" \
    "sentry.io" \
    "registry.npmjs.org" \
    "binaries.prisma.sh" \
    "download.docker.com" \
    "registry-1.docker.io" \
    "auth.docker.io" \
    "production.cloudflare.docker.com" \
    "api.github.com" \
    "github.com" \
    "codeload.github.com" \
    "objects.githubusercontent.com" \
    "raw.githubusercontent.com" \
    "ghcr.io" \
    "pkg-containers.githubusercontent.com"; do
    echo "Resolving $domain..."
    ips=$(dig +short A "$domain" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
    if [ -z "$ips" ]; then
        echo "WARNING: Failed to resolve $domain"
        continue
    fi
    while IFS= read -r ip; do
        echo "Adding $ip for $domain"
        ipset add allowed-domains "$ip" 2>/dev/null || true
    done <<< "$ips"
done

HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -n "$HOST_IP" ]; then
    HOST_NETWORK=$(echo "$HOST_IP" | sed 's/\.[0-9]*$/.0\/24/')
    echo "Allowing host network: $HOST_NETWORK"
    iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
    iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT
fi

iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

echo "Firewall configured. Verifying..."
if curl --connect-timeout 5 -s https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed — example.com is reachable."
    exit 1
else
    echo "OK: example.com is blocked."
fi

if ! curl --connect-timeout 5 -s -o /dev/null -w "%{http_code}" https://api.anthropic.com/v1/health 2>&1 | grep -qE '^(200|401|404|405)$'; then
    echo "WARNING: api.anthropic.com may not be reachable."
else
    echo "OK: api.anthropic.com reachable."
fi

echo "Firewall initialization complete."
