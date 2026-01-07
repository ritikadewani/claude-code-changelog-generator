#!/usr/bin/env node

/**
 * Changelog Generator for anthropics/claude-code
 * Fetches merged PRs from the last 7 days and generates a user-friendly changelog
 */

const REPO_OWNER = 'anthropics';
const REPO_NAME = 'claude-code';
const DAYS_TO_FETCH = 7;

// =============================================================================
// GitHub API Client
// =============================================================================

async function fetchMergedPRs(since) {
  const baseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`;
  const params = new URLSearchParams({
    state: 'closed',
    sort: 'updated',
    direction: 'desc',
    per_page: '100'
  });

  const response = await fetch(`${baseUrl}?${params}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'changelog-generator'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const prs = await response.json();

  // Filter to only merged PRs within the date range
  return prs.filter(pr => {
    if (!pr.merged_at) return false;
    const mergedDate = new Date(pr.merged_at);
    return mergedDate >= since;
  });
}

// =============================================================================
// Change Filtering
// =============================================================================

// Labels and title patterns that indicate internal/non-user-facing changes
const SKIP_LABELS = [
  'internal',
  'ci',
  'test',
  'tests',
  'testing',
  'infrastructure',
  'infra',
  'chore',
  'dependencies',
  'deps',
  'tooling',
  'refactor',
  'refactoring'
];

const SKIP_TITLE_PATTERNS = [
  /^chore(\(.*\))?:/i,
  /^ci(\(.*\))?:/i,
  /^test(\(.*\))?:/i,
  /^tests(\(.*\))?:/i,
  /^refactor(\(.*\))?:/i,
  /^internal(\(.*\))?:/i,
  /^infra(\(.*\))?:/i,
  /^deps(\(.*\))?:/i,
  /^build(\(.*\))?:/i,
  /update.*dependencies/i,
  /bump.*version/i,
  /merge.*branch/i,
  /\[skip.*changelog\]/i,
  /\[internal\]/i
];

function isUserFacing(pr) {
  // Check labels
  const prLabels = pr.labels.map(l => l.name.toLowerCase());
  if (prLabels.some(label => SKIP_LABELS.includes(label))) {
    return false;
  }

  // Check title patterns
  if (SKIP_TITLE_PATTERNS.some(pattern => pattern.test(pr.title))) {
    return false;
  }

  return true;
}

function filterUserFacingChanges(prs) {
  return prs.filter(isUserFacing);
}

// =============================================================================
// Category Classification
// =============================================================================

function categorizeChange(pr) {
  const title = pr.title.toLowerCase();
  const labels = pr.labels.map(l => l.name.toLowerCase());

  // Bug Fixes: starts with "fix", contains "fix" after a prefix, or bug-related keywords
  const isBugFix =
    /^fix/i.test(pr.title) ||           // starts with fix
    /^[a-z]+(\(.*?\))?:\s*fix/i.test(pr.title) ||  // conventional commit with fix after prefix (e.g., "docs: Fix...")
    title.includes('bug') ||
    title.includes('broken') ||
    title.includes('issue') ||
    title.includes('crash') ||
    title.includes('error') ||
    labels.some(l => ['bug', 'fix', 'bugfix', 'hotfix'].includes(l));

  if (isBugFix) {
    return 'Bug Fixes';
  }

  // New Features: feat, add, new, support, introduce
  const isFeature =
    /^feat(\(.*\))?:/i.test(pr.title) ||
    /^add\b/i.test(pr.title) ||
    /^[a-z]+(\(.*?\))?:\s*add/i.test(pr.title) ||  // "scope: Add..."
    /^new\b/i.test(pr.title) ||
    title.includes('support for') ||
    title.includes('introduce') ||
    title.includes('implement') ||
    labels.some(l => ['feature', 'enhancement', 'new'].includes(l));

  if (isFeature) {
    return 'New Features';
  }

  // Everything else is an Improvement
  return 'Improvements';
}

function groupByCategory(prs) {
  const grouped = {
    'New Features': [],
    'Improvements': [],
    'Bug Fixes': []
  };

  for (const pr of prs) {
    const category = categorizeChange(pr);
    grouped[category].push(pr);
  }

  return grouped;
}

// =============================================================================
// Title Processing
// =============================================================================

// Clean the PR title by removing conventional commit prefixes
function cleanTitle(title) {
  // Remove conventional commit prefixes like "fix(scope):" or "feat:"
  let cleaned = title.replace(/^[a-z]+(\(.*?\))?:\s*/i, '');

  // Remove trailing periods
  cleaned = cleaned.replace(/\.$/, '');

  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  return cleaned;
}

// Technical patterns that need plain-English explanations
const TECHNICAL_EXPLANATIONS = [
  // Security/Permissions
  [/remove.*(?:overly |too )?broad.*permission/i, 'GitHub commands now request only the permissions they need, improving security.'],
  [/restrict.*permission/i, 'Tightened security by limiting what actions can be performed.'],
  [/(?:add|allow).*(?:to )?(?:allowed|permitted|whitelist).*pattern/i, 'More command variations are now supported.'],
  [/add.*:.*to.*pattern/i, 'Commands can now accept additional arguments.'],

  // Configuration/Setup
  [/move.*(?:bash|script|command).*(?:to|from).*(?:script|setup|config)/i, 'Simplified the setup process for better reliability.'],
  [/multi-?line.*bash/i, 'Complex commands are now handled more reliably.'],

  // API/Integration
  [/\bgh\s+api\b/i, 'Relates to GitHub integration.'],
  [/\bapi\s+(?:endpoint|call|request)/i, 'Affects how the tool communicates with external services.'],

  // Performance
  [/reduce.*(?:memory|cpu|load|latency)/i, 'The tool now uses fewer system resources.'],
  [/improve.*(?:perf|performance|speed)/i, 'Operations complete faster now.'],
  [/(?:cache|caching)/i, 'Frequently used data is now stored for faster access.'],

  // Error handling
  [/(?:handle|catch).*(?:error|exception)/i, 'Error scenarios are now handled more gracefully.'],
  [/(?:fix|prevent).*crash/i, 'Resolved an issue that could cause the tool to stop unexpectedly.'],
  [/(?:fix|prevent).*hang/i, 'Resolved an issue that could cause the tool to become unresponsive.'],

  // Internal terms that need explanation
  [/dedupe/i, 'Relates to removing duplicate entries.'],
  [/\bregex\b/i, 'Relates to pattern matching functionality.'],
  [/\bwebhook/i, 'Relates to automated notifications.'],
  [/\btoken\b/i, 'Relates to authentication credentials.'],
];

// Patterns for titles that are simple enough to NOT need explanation
const SIMPLE_PATTERNS = [
  /^fix\s+(broken\s+)?links?/i,
  /^update\s+(the\s+)?readme/i,
  /^fix\s+typo/i,
  /^add\s+documentation/i,
  /^improve\s+error\s+messages?/i,
];

function getExplanation(title) {
  // Check if it's simple enough to not need explanation
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(title)) {
      return null;
    }
  }

  // Check for technical patterns that need explanation
  for (const [pattern, explanation] of TECHNICAL_EXPLANATIONS) {
    if (pattern.test(title)) {
      return explanation;
    }
  }

  // Check if title contains technical jargon that warrants explanation
  const technicalTerms = [
    'api', 'cli', 'bash', 'shell', 'regex', 'webhook', 'token', 'endpoint',
    'config', 'env', 'param', 'arg', 'init', 'auth', 'permission', 'scope',
    'stdin', 'stdout', 'stderr', 'async', 'sync', 'callback', 'handler',
    'dedupe', 'cache', 'buffer', 'stream', 'pipe', 'fork', 'spawn'
  ];

  const lowerTitle = title.toLowerCase();
  const hasTechnicalTerms = technicalTerms.some(term => lowerTitle.includes(term));

  if (hasTechnicalTerms) {
    // Generic explanation for unmatched technical content
    return 'This is a technical change that improves how the tool works internally.';
  }

  return null;
}

// =============================================================================
// Markdown Output
// =============================================================================

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function generateMarkdown(groupedChanges, startDate, endDate) {
  const lines = [];

  lines.push(`# Claude Code Changelog`);
  lines.push('');
  lines.push(`**${formatDate(startDate)} - ${formatDate(endDate)}**`);
  lines.push('');
  lines.push('---');
  lines.push('');

  let hasChanges = false;

  for (const [category, prs] of Object.entries(groupedChanges)) {
    if (prs.length === 0) continue;
    hasChanges = true;

    lines.push(`## ${category}`);
    lines.push('');

    for (const pr of prs) {
      const cleanedTitle = cleanTitle(pr.title);
      const prUrl = pr.html_url;
      const prNumber = pr.number;
      const author = pr.user.login;

      // Main entry line with title, PR link, and author
      lines.push(`- **${cleanedTitle}** ([#${prNumber}](${prUrl})) by @${author}`);

      // Add explanation if the title is technical
      const explanation = getExplanation(pr.title);
      if (explanation) {
        lines.push(`  _What this means: ${explanation}_`);
      }
    }

    lines.push('');
  }

  if (!hasChanges) {
    lines.push('*No user-facing changes in this period.*');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Generated on ${formatDate(new Date())}*`);

  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Fetching merged PRs from anthropics/claude-code...\n');

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS_TO_FETCH);

  try {
    // Step 1: Fetch PRs
    const allPRs = await fetchMergedPRs(startDate);
    console.log(`Found ${allPRs.length} merged PRs in the last ${DAYS_TO_FETCH} days`);

    // Step 2: Filter to user-facing
    const userFacingPRs = filterUserFacingChanges(allPRs);
    console.log(`Filtered to ${userFacingPRs.length} user-facing changes`);

    // Step 3: Group by category
    const groupedChanges = groupByCategory(userFacingPRs);
    console.log(`Categorized: ${groupedChanges['New Features'].length} features, ${groupedChanges['Improvements'].length} improvements, ${groupedChanges['Bug Fixes'].length} fixes\n`);

    // Step 4: Generate markdown
    const changelog = generateMarkdown(groupedChanges, startDate, endDate);

    // Write to file
    const fs = require('fs');
    fs.writeFileSync('changelog.md', changelog);
    console.log('Written to changelog.md\n');

    console.log('='.repeat(60));
    console.log(changelog);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error generating changelog:', error.message);
    process.exit(1);
  }
}

main();
