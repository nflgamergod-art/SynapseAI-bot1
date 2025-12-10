const fs = require('fs');

const priorityCommands = new Set([
  'help', 'ping', 'diagcommands', 'clockin', 'clockout', 'forceclockout',
  'payroll', 'shifts', 'shiftstats', 'whosonduty', 'schedule', 'upt',
  'attendance', 'staffactivity', 'promotion', 'violations', 'ticket',
  'ticketsla', 'tickettag', 'ticketnote', 'ticketanalytics', 'ticketfeedback',
  'autoresponse', 'staffexpertise', 'ticketrouting', 'supportstats',
  'warn', 'mute', 'kick', 'ban', 'cases', 'appeal'
]);

// Read the source file
const sourcePath = process.argv[2];
const targetPath = process.argv[3];

console.log('Reading from:', sourcePath);
console.log('Writing to:', targetPath);

let content = fs.readFileSync(sourcePath, 'utf8');

// Find the commands array
const commandsStart = content.indexOf('const commands = [');
if (commandsStart === -1) {
  console.error('Could not find commands array');
  process.exit(1);
}

const commandsEnd = content.indexOf('];', commandsStart);
if (commandsEnd === -1) {
  console.error('Could not find end of commands array');
  process.exit(1);
}

// Extract the commands array content
const before = content.substring(0, commandsStart);
const commandsSection = content.substring(commandsStart, commandsEnd + 2);
const after = content.substring(commandsEnd + 2);

// Parse and filter commands (simple regex approach)
const commandPattern = /\{\s*name:\s*"([^"]+)"/g;
let match;
const commandsToRemove = [];

while ((match = commandPattern.exec(commandsSection)) !== null) {
  const commandName = match[1];
  if (priorityCommands.has(commandName)) {
    commandsToRemove.push(commandName);
  }
}

console.log('Commands to remove:', commandsToRemove.join(', '));

// Now remove each command by finding its complete object
let filteredCommands = commandsSection;

for (const cmdName of commandsToRemove) {
  // Find the command object - match from { name: "cmdname" to the next closing }
  // that has a matching brace count
  const namePattern = new RegExp(`\\{\\s*name:\\s*"${cmdName}"`, 'g');
  let pos = 0;
  
  while ((match = namePattern.exec(filteredCommands)) !== null) {
    const startPos = match.index;
    let braceCount = 0;
    let endPos = startPos;
    let inString = false;
    let escapeNext = false;
    
    // Find matching closing brace
    for (let i = startPos; i < filteredCommands.length; i++) {
      const char = filteredCommands[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' || char === "'" || char === '`') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          endPos = i + 1;
          break;
        }
      }
    }
    
    // Remove this command object and any trailing comma/whitespace
    let removeEnd = endPos;
    while (removeEnd < filteredCommands.length && (filteredCommands[removeEnd] === ',' || /\s/.test(filteredCommands[removeEnd]))) {
      removeEnd++;
      if (filteredCommands[removeEnd] === '\n') {
        removeEnd++;
        break;
      }
    }
    
    filteredCommands = filteredCommands.substring(0, startPos) + filteredCommands.substring(removeEnd);
    
    console.log(`  Removed: ${cmdName}`);
    break; // Only remove first occurrence
  }
}

// Clean up any double commas or trailing commas
filteredCommands = filteredCommands.replace(/,\s*,/g, ',');
filteredCommands = filteredCommands.replace(/,\s*\]/g, ']');

// Also update PRIORITY_NAMES to empty set
filteredCommands = filteredCommands.replace(
  /const PRIORITY_NAMES = new Set\(\[[^\]]*\]\);/,
  'const PRIORITY_NAMES = new Set([]);'
);

// Reconstruct the file
const newContent = before + filteredCommands + after;

// Write to target
fs.writeFileSync(targetPath, newContent, 'utf8');
console.log('✅ Filtered index.ts created');
console.log('Commands removed:', commandsToRemove.length);
