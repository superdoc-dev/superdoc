/* eslint-env node */

const { spawnSync } = require('node:child_process');

const LINEAR_API_URL = 'https://api.linear.app/graphql';

function makeSemanticReleaseError(message, code, details) {
  const error = new Error(details ? `${message}: ${details}` : message);
  error.name = 'SemanticReleaseError';
  error.code = code;
  error.details = details;
  return error;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTeamKeys(teamKeys) {
  return (Array.isArray(teamKeys) ? teamKeys : [])
    .map((key) => String(key || '').trim().toUpperCase())
    .filter(Boolean);
}

function extractIssueIdsFromText(text, teamKeys = []) {
  const source = String(text || '');
  if (/^Linear-Sync:\s*none\s*$/im.test(source)) {
    return [];
  }
  const normalizedKeys = normalizeTeamKeys(teamKeys).filter((key) => /^[A-Z]+$/.test(key));
  const teamPattern = normalizedKeys.length > 0
    ? `(?:${normalizedKeys.map(escapeRegex).join('|')})`
    : '[A-Z]+';
  const issuePattern = new RegExp(`(^|[^A-Z0-9])(${teamPattern}-\\d+)(?=[^\\d]|$)`, 'gi');
  const issueIds = new Set();
  for (const match of source.matchAll(issuePattern)) {
    issueIds.add(match[2].toUpperCase());
  }
  return [...issueIds];
}

function getCommitHash(commit) {
  return commit?.hash || commit?.commit?.long || commit?.commit?.short || '';
}

function readCommitMessageFromGit(hash, cwd) {
  if (!hash) {
    return '';
  }
  const result = spawnSync('git', ['-C', cwd || process.cwd(), 'log', '-1', '--format=%B', hash], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function getCommitText(commit, cwd) {
  const hash = getCommitHash(commit);
  const gitMessage = readCommitMessageFromGit(hash, cwd);
  if (gitMessage) {
    return gitMessage;
  }
  return [
    commit?.message,
    commit?.subject,
    commit?.body,
    commit?.footer,
  ].filter(Boolean).join('\n\n');
}

function isReleaseAutomationCommit(text) {
  const subject = String(text || '').split('\n', 1)[0] || '';
  return /^chore(?:\([^)]+\))?: .*\[skip ci\]\s*$/i.test(subject);
}

function collectIssueIdsFromCommits(commits, options = {}) {
  const issueIds = new Set();
  for (const commit of commits || []) {
    const text = getCommitText(commit, options.cwd);
    if (isReleaseAutomationCommit(text)) {
      continue;
    }
    for (const issueId of extractIssueIdsFromText(text, options.teamKeys)) {
      issueIds.add(issueId);
    }
  }
  return [...issueIds];
}

function getAuthHeader(token) {
  return String(token || '').startsWith('lin_api_') ? token : `Bearer ${token}`;
}

async function linearRequest(token, query, variables = {}) {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Linear API HTTP ${response.status}`);
  }
  if (payload.errors?.length) {
    throw new Error(`Linear API error: ${payload.errors[0].message}`);
  }
  if (!payload.data) {
    throw new Error('Linear API returned no data');
  }
  return payload.data;
}

async function testConnection(token) {
  const data = await linearRequest(token, `
    query TestConnection {
      viewer {
        id
        name
      }
    }
  `);
  return data.viewer;
}

async function ensureLabel(token, name, color) {
  const findLabel = async () => {
    const existing = await linearRequest(token, `
      query FindLabel($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) {
          nodes {
            id
            name
          }
        }
      }
    `, { name });
    return existing.issueLabels.nodes[0] || null;
  };

  const label = await findLabel();
  if (label) {
    return label;
  }

  try {
    const created = await linearRequest(token, `
      mutation CreateLabel($name: String!, $color: String!) {
        issueLabelCreate(input: { name: $name, color: $color }) {
          issueLabel {
            id
            name
          }
        }
      }
    `, { name, color });
    return created.issueLabelCreate.issueLabel;
  } catch (error) {
    // Two package releases can race to create the same version label. Re-query
    // once before treating the create failure as fatal.
    const existingAfterRace = await findLabel();
    if (existingAfterRace) {
      return existingAfterRace;
    }
    throw error;
  }
}

async function getIssue(token, identifier, options = {}) {
  try {
    const data = await linearRequest(token, `
      query GetIssue($identifier: String!) {
        issue(id: $identifier) {
          id
          identifier
          title
          labels {
            nodes {
              id
              name
            }
          }
        }
      }
    `, { identifier });
    return data.issue || null;
  } catch (error) {
    if (options.throwOnError) {
      throw error;
    }
    return null;
  }
}

async function addLabelToIssue(token, issueId, labelId) {
  const issue = await getIssue(token, issueId, { throwOnError: true });
  if (!issue) {
    throw new Error(`Linear issue ${issueId} not found while adding label`);
  }
  const existingLabelIds = issue.labels.nodes.map((label) => label.id);
  if (existingLabelIds.includes(labelId)) {
    return issue;
  }
  const labelIds = [...new Set([...existingLabelIds, labelId])];
  const data = await linearRequest(token, `
    mutation AddLabel($issueId: String!, $labelIds: [String!]!) {
      issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
        issue {
          id
        }
      }
    }
  `, { issueId, labelIds });
  return data.issueUpdate.issue;
}

function isVersionLabel(labelName, labelPrefix) {
  return new RegExp(`^${escapeRegex(labelPrefix)}\\d`).test(labelName);
}

async function removeVersionLabels(token, issueId, labelPrefix) {
  const issue = await getIssue(token, issueId);
  if (!issue) {
    return null;
  }
  const versionLabels = issue.labels.nodes.filter((label) => isVersionLabel(label.name, labelPrefix));
  for (const label of versionLabels) {
    await linearRequest(token, `
      mutation RemoveLabel($issueId: String!, $labelId: String!) {
        issueRemoveLabel(id: $issueId, labelId: $labelId) {
          issue {
            id
          }
        }
      }
    `, { issueId, labelId: label.id });
  }
  return issue;
}

async function addComment(token, issueId, body) {
  const data = await linearRequest(token, `
    mutation AddComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        comment {
          id
        }
      }
    }
  `, { issueId, body });
  return data.commentCreate.comment;
}

function getLabelColor(releaseType) {
  const colors = {
    major: '#F44336',
    premajor: '#E91E63',
    minor: '#FF9800',
    preminor: '#FFC107',
    patch: '#4CAF50',
    prepatch: '#8BC34A',
    prerelease: '#9C27B0',
  };
  return colors[releaseType] || '#4752C4';
}

function buildReleaseUrl(repositoryUrl, gitTag) {
  if (!repositoryUrl || !gitTag) {
    return '';
  }
  const match = String(repositoryUrl).match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) {
    return '';
  }
  return `https://github.com/${match[1]}/${match[2]}/releases/tag/${gitTag}`;
}

function formatComment(template, version, channel, packageName, gitTag, repositoryUrl) {
  const channelText = channel ? `(${channel} channel)` : '';
  const packageText = packageName ? `**${packageName}**` : '';
  const releaseUrl = buildReleaseUrl(repositoryUrl, gitTag);
  const releaseLink = releaseUrl ? `[${version}](${releaseUrl})` : version;
  const tpl = template || 'Released in {package} v{releaseLink} {channel}';
  return tpl
    .replace(/{version}/g, version)
    .replace(/{channel}/g, channelText)
    .replace(/{package}/g, packageText)
    .replace(/{packageName}/g, packageName || '')
    .replace(/{releaseUrl}/g, releaseUrl)
    .replace(/{releaseLink}/g, releaseLink)
    .replace(/{gitTag}/g, gitTag)
    .replace(/\s+/g, ' ')
    .trim();
}

async function verifyConditions(pluginConfig = {}, context = {}) {
  const token = pluginConfig.token || process.env.LINEAR_TOKEN;
  if (!token) {
    throw makeSemanticReleaseError(
      'No Linear token found',
      'ENOLINEARTOKEN',
      'Set LINEAR_TOKEN in the release environment.',
    );
  }
  const invalidTeamKeys = normalizeTeamKeys(pluginConfig.teamKeys).filter((key) => !/^[A-Z]+$/.test(key));
  if (invalidTeamKeys.length > 0) {
    throw makeSemanticReleaseError(
      'Invalid team key format',
      'EINVALIDTEAMKEY',
      `Team keys must be uppercase letters. Invalid: ${invalidTeamKeys.join(', ')}`,
    );
  }
  context.logger?.log?.('Verifying Linear API access...');
  await testConnection(token);
  context.logger?.log?.('Linear API access verified');
}

async function success(pluginConfig = {}, context = {}) {
  const { commits = [], logger = console, nextRelease = {}, options = {}, cwd = process.cwd() } = context;
  if (!commits.length) {
    logger.log?.('No commits found in release, skipping Linear updates');
    return;
  }
  const token = pluginConfig.token || process.env.LINEAR_TOKEN;
  if (!token) {
    logger.log?.('No LINEAR_TOKEN found, skipping Linear updates');
    return;
  }
  const teamKeys = normalizeTeamKeys(pluginConfig.teamKeys);
  const issueIds = collectIssueIdsFromCommits(commits, { cwd, teamKeys });
  if (issueIds.length === 0) {
    logger.log?.('No Linear issues found in released commit messages');
    return;
  }

  const {
    addComment: shouldAddComment = false,
    commentTemplate,
    dryRun = false,
    labelPrefix = 'v',
    packageName = null,
    removeOldLabels = true,
  } = pluginConfig;
  const version = nextRelease.version;
  const packagePrefix = packageName ? `${packageName}-` : '';
  const labelName = `${packagePrefix}${labelPrefix}${version}`;

  logger.log?.(`Found ${issueIds.length} Linear issue(s) in released commits: ${issueIds.join(', ')}`);
  if (dryRun || options.dryRun) {
    logger.log?.(`[Dry run] Would apply Linear label ${labelName} to: ${issueIds.join(', ')}`);
    return;
  }

  const label = await ensureLabel(token, labelName, getLabelColor(nextRelease.type));
  const results = await Promise.allSettled(issueIds.map(async (issueId) => {
    const issue = await getIssue(token, issueId);
    if (!issue) {
      logger.warn?.(`Issue ${issueId} not found in Linear`);
      return { issueId, status: 'not_found' };
    }
    if (removeOldLabels) {
      await removeVersionLabels(token, issue.id, `${packagePrefix}${labelPrefix}`);
    }
    await addLabelToIssue(token, issue.id, label.id);
    if (shouldAddComment) {
      await addComment(
        token,
        issue.id,
        formatComment(
          commentTemplate,
          version,
          nextRelease.channel,
          packageName,
          nextRelease.gitTag,
          options.repositoryUrl,
        ),
      );
    }
    logger.log?.(`Updated Linear issue ${issueId}`);
    return { issueId, status: 'updated' };
  }));

  const updated = results.filter((result) => result.status === 'fulfilled' && result.value?.status === 'updated').length;
  const failed = results.filter((result) => result.status === 'rejected').length;
  const notFound = results.filter((result) => result.status === 'fulfilled' && result.value?.status === 'not_found').length;
  logger.log?.(`Linear update complete: ${updated} updated, ${failed} failed, ${notFound} not found`);
}

module.exports = {
  collectIssueIdsFromCommits,
  extractIssueIdsFromText,
  formatComment,
  isVersionLabel,
  isReleaseAutomationCommit,
  success,
  verifyConditions,
};
