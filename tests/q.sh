#!/bin/bash
# Run one SQL statement on the Lumaby Supabase project (used by the e2e tests
# to create a temporary Premium subscription, check rows and clean up).
#   SUPABASE_PROJECT_REF   default: pduixzudfizustabthwu
#   SUPABASE_ACCESS_TOKEN  a Supabase personal access token (sbp_...)
# Prints the JSON result, then "HTTP <code>".
REF="${SUPABASE_PROJECT_REF:-pduixzudfizustabthwu}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-proxy-injected}"
python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$1" | curl -sS --max-time 60 -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @- -w "\nHTTP %{http_code}\n"
