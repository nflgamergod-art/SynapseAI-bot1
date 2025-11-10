#!/bin/bash
# Extract command names from command definitions
grep -o "{ name: \"[^\"]*\"" src/index.ts | grep -o "\"[^\"]*\"" | tr -d '"' | sort -u > /tmp/defined_commands.txt

# Extract command handlers
grep -E "(commandName === '|name === '|subCmd === '|case ')" src/index.ts src/commands/*.ts 2>/dev/null | grep -o "'[^']*'" | tr -d "'" | sort -u > /tmp/handled_commands.txt

echo "=== DEFINED COMMANDS ==="
wc -l /tmp/defined_commands.txt
echo ""
echo "=== HANDLED COMMANDS ==="
wc -l /tmp/handled_commands.txt
echo ""
echo "=== POTENTIALLY MISSING HANDLERS (may include subcommands) ==="
comm -23 /tmp/defined_commands.txt /tmp/handled_commands.txt | head -20
