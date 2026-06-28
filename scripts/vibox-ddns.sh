#!/bin/bash
T=$(cat "$HOME/.cf_token" 2>/dev/null); [ -z "$T" ] && exit 0
ZONE=622b335254e4d5e7105190efa4279bdc
IP=$(curl -s --max-time 10 https://api.ipify.org); [ -z "$IP" ] && exit 0
for h in u1.vibox.cloud u2.vibox.cloud; do
  REC=$(curl -s -H "Authorization: Bearer $T" "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?type=A&name=$h")
  RID=$(echo "$REC" | grep -oE "[a-f0-9]{32}" | head -1)
  CUR=$(echo "$REC" | sed -nE 's/.*"content":"([0-9.]+)".*/\1/p' | head -1)
  if [ -n "$RID" ] && [ "$CUR" != "$IP" ]; then
    curl -s -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data "{\"content\":\"$IP\",\"proxied\":false}" "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/$RID" >/dev/null
    echo "$(date '+%F %T') $h $CUR -> $IP"
  fi
done
exit 0
