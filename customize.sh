#!/system/bin/sh
SKIPUNZIP=0
ui_print " "
ui_print "  FORGE // GIT"
ui_print "  GitHub client for your root manager"
ui_print " "
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/forge.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755
mkdir -p /data/adb/forge
ui_print "- Checking tools..."
command -v curl >/dev/null 2>&1 && ui_print "  [ok] curl" || ui_print "  [!!] curl not found, API calls will fail"
ui_print "- Open the WebUI from the module card."
ui_print "- Go to Settings, paste your GitHub token."
ui_print " "
