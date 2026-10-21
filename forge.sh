#!/system/bin/sh
# FORGE // GIT - GitHub client backend
# Usage: forge.sh <command> [args]   (run as root)

export PATH="/system/bin:/system/xbin:/data/adb/ksu/bin:/data/adb/ap/bin:/data/adb/magisk:$PATH"
DATA="/data/adb/forge"
TOKEN_FILE="$DATA/token"
CACHE="$DATA/cache"
UA="FORGE-Git/1.0"
mkdir -p "$DATA" "$CACHE" 2>/dev/null

BB=""
for b in /data/adb/ksu/bin/busybox /data/adb/ap/bin/busybox /data/adb/magisk/busybox; do
  [ -x "$b" ] && { BB=$b; break; }
done

token() { cat "$TOKEN_FILE" 2>/dev/null | tr -d '\n\r '; }

api() { # method endpoint [data]
  local t=$(token) m=$1 ep=$2 d=$3
  [ -z "$t" ] && { echo '{"error":"no token"}'; return 1; }
  local url="https://api.github.com${ep}"
  local args="-sSL --connect-timeout 20 --max-time 120 -A $UA"
  args="$args -H 'Authorization: token $t' -H 'Accept: application/vnd.github+json'"
  if [ "$m" = GET ]; then
    eval curl $args "$url" 2>/dev/null
  elif [ "$m" = DELETE ]; then
    eval curl $args -X DELETE "$url" 2>/dev/null
  else
    eval curl $args -X "$m" -H "'Content-Type: application/json'" -d "'$d'" "$url" 2>/dev/null
  fi
}

# Download a file (release asset, raw content)
dl() { # url outpath
  local t=$(token)
  curl -fsSL --connect-timeout 20 --max-time 600 -A "$UA" \
    -H "Authorization: token $t" -H "Accept: application/octet-stream" \
    -o "$2" "$1" 2>/dev/null && echo '{"ok":true,"path":"'"$2"'"}' || echo '{"ok":false}'
}

cmd=$1; [ $# -gt 0 ] && shift
case "$cmd" in
  token_set)
    # $1 = token (base64 encoded for safety)
    printf '%s' "$1" | base64 -d 2>/dev/null > "$TOKEN_FILE"
    chmod 0600 "$TOKEN_FILE"
    echo '{"ok":true}' ;;
  token_check)
    [ -s "$TOKEN_FILE" ] && echo '{"has":true}' || echo '{"has":false}' ;;
  token_clear)
    rm -f "$TOKEN_FILE"; echo '{"ok":true}' ;;
  api)
    # $1=method $2=endpoint $3=body(base64)
    body=""
    [ -n "$3" ] && body=$(printf '%s' "$3" | base64 -d 2>/dev/null)
    api "$1" "$2" "$body" ;;
  dl)
    # $1=url $2=filename
    dl "$1" "$CACHE/$2" ;;
  share)
    # $1=filepath - open with share intent
    am start -a android.intent.action.VIEW -d "file://$1" -t application/octet-stream 2>/dev/null
    echo '{"ok":true}' ;;
  open)
    am start -a android.intent.action.VIEW -d "$1" >/dev/null 2>&1; echo '{"ok":true}' ;;
  tools)
    c=0; command -v curl >/dev/null 2>&1 && c=1
    printf '{"curl":%s,"sdk":"%s","abi":"%s","device":"%s"}\n' "$c" \
      "$(getprop ro.build.version.sdk)" "$(getprop ro.product.cpu.abi)" "$(getprop ro.product.device)" ;;
  *) echo '{"error":"unknown command"}' ;;
esac
