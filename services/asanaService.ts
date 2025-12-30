import { AsanaTask, AsanaStory, EnrichedTask, LogEntry } from '../types';

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';

/**
 * Extracts the Task GID from various Asana URL formats.
 * Supports:
 * - Direct GID: 123456
 * - Standard: https://app.asana.com/0/project_id/task_id
 * - Inbox: https://app.asana.com/0/inbox/task_id
 * - Search: https://app.asana.com/0/search/search_id/task_id
 * - Focused: https://app.asana.com/0/.../task_id/f
 */
export const extractTaskGid = (url: string): string | null => {
  if (!url) return null;
  const cleanUrl = url.trim();

  // 1. Direct GID check
  if (/^\d+$/.test(cleanUrl)) {
    return cleanUrl;
  }

  // 2. URL Parsing Strategy
  try {
    const urlStr = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
    const urlObj = new URL(urlStr);

    if (!urlObj.hostname.includes('asana.com')) {
      return null;
    }

    // Split path into segments and find numeric ones
    const segments = urlObj.pathname.split('/').filter(Boolean);
    const numericSegments = segments.filter(seg => /^\d+$/.test(seg));

    // Return the last numeric segment (usually the Task GID)
    if (numericSegments.length > 0) {
      return numericSegments[numericSegments.length - 1];
    }
  } catch (e) {
    // Ignore URL parse errors, fall through to regex
  }

  // 3. Fallback Regex for partials or text containing the link
  // Matches .../0/<context>/<task_id>
  const match = cleanUrl.match(/asana\.com\/0\/[^\/]+\/(\d+)/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
};

/**
 * Helper to make rate-limit aware fetch requests.
 */
const fetchAsana = async <T,>(
  path: string, 
  token: string
): Promise<T> => {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };

  const response = await fetch(`${ASANA_API_BASE}${path}`, { headers });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized: Invalid Personal Access Token.');
    }
    if (response.status === 404) {
      throw new Error(`Not Found: Resource at ${path} does not exist or you lack access.`);
    }
    if (response.status === 429) {
      throw new Error('Rate Limit Exceeded: Please wait a moment and try again.');
    }
    throw new Error(`Asana API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
};

/**
 * recursive fetcher
 */
export const processTask = async (
  taskGid: string,
  token: string,
  log: (msg: string, type?: 'info' | 'success' | 'error') => void,
  depth: number = 0
): Promise<EnrichedTask> => {
  const indent = '  '.repeat(depth);
  
  // 1. Fetch Task Details
  if (depth === 0) log(`Fetching main task details (${taskGid})...`, 'info');
  
  const taskFields = 'name,notes,assignee.name,due_on,completed,permalink_url';
  const task = await fetchAsana<AsanaTask>(
    `/tasks/${taskGid}?opt_fields=${taskFields}`,
    token
  );

  // 2. Fetch Stories (Comments)
  // Only fetching comments for this specific task node
  const stories = await fetchAsana<AsanaStory[]>(
    `/tasks/${taskGid}/stories?opt_fields=text,created_at,created_by.name,resource_subtype&limit=100`,
    token
  );
  const comments = stories.filter(s => s.resource_subtype === 'comment_added');
  if (comments.length > 0) {
    // log(`${indent}Found ${comments.length} comments for "${task.name.substring(0, 20)}..."`, 'info');
  }

  // 3. Fetch Subtasks
  // We perform a shallow list fetch first, then recurse
  const subtaskList = await fetchAsana<AsanaTask[]>(
    `/tasks/${taskGid}/subtasks?opt_fields=gid,name`, 
    token
  );

  const enrichedSubtasks: EnrichedTask[] = [];

  if (subtaskList.length > 0) {
    if (depth === 0) log(`Found ${subtaskList.length} subtasks. Processing...`, 'info');
    
    // Process subtasks sequentially to avoid hitting rate limits too hard
    let completedCount = 0;
    for (const sub of subtaskList) {
        // Log progress every few subtasks or for every one if it's top level
        completedCount++;
        if (depth === 0) {
           log(`Processing subtask ${completedCount}/${subtaskList.length}: "${sub.name}"`, 'info');
        }

        try {
            // Recursive call
            const fullSubtask = await processTask(sub.gid, token, log, depth + 1);
            enrichedSubtasks.push(fullSubtask);
        } catch (error) {
            log(`${indent}Failed to fetch subtask ${sub.gid}: ${error}`, 'error');
        }
    }
  }

  return {
    ...task,
    stories: comments,
    subtasks: enrichedSubtasks,
  };
};

/**
 * Format Date helper
 */
const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No Date';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Generates the Markdown string from the EnrichedTask object.
 */
export const generateMarkdown = (task: EnrichedTask): string => {
  let md = '';

  // --- Header ---
  md += `# ${task.name}\n\n`;
  
  // --- Metadata ---
  md += `**Link:** [Open in Asana](${task.permalink_url})\n`;
  md += `**Assignee:** ${task.assignee ? task.assignee.name : 'Unassigned'} | `;
  md += `**Due:** ${formatDate(task.due_on)} | `;
  md += `**Status:** ${task.completed ? '✅ Completed' : '⭕ Incomplete'}\n\n`;

  // --- Description ---
  md += `## Description\n\n`;
  if (task.notes) {
      md += `${task.notes}\n\n`;
  } else {
      md += `_No description provided._\n\n`;
  }

  // --- Comments ---
  if (task.stories.length > 0) {
      md += `## Comments\n\n`;
      task.stories.forEach(story => {
          const author = story.created_by ? story.created_by.name : 'Unknown';
          const date = new Date(story.created_at).toLocaleString();
          md += `### 🗣️ ${author} - ${date}\n`;
          md += `${story.text}\n\n`;
          md += `---\n\n`;
      });
  }

  // --- Subtasks (Recursive renderer) ---
  if (task.subtasks.length > 0) {
      md += `## Subtasks\n\n`;
      
      const renderSubtasks = (subtasks: EnrichedTask[], level: number) => {
          subtasks.forEach((sub, index) => {
             const headerPrefix = '#'.repeat(level + 2); // Start at h3
             const statusIcon = sub.completed ? '✅' : '⭕';
             
             md += `${headerPrefix} ${index + 1}. ${statusIcon} ${sub.name}\n\n`;
             
             // Minimal metadata for subtasks
             md += `*Assignee: ${sub.assignee?.name || 'Unassigned'} | Due: ${formatDate(sub.due_on)}*\n\n`;
             
             if (sub.notes) {
                 // Quote the description to distinguish it
                 md += `> ${sub.notes.replace(/\n/g, '\n> ')}\n\n`;
             }

             if (sub.stories.length > 0) {
                 md += `**Comments:**\n`;
                 sub.stories.forEach(s => {
                     const a = s.created_by?.name || 'Unknown';
                     md += `- **${a}**: ${s.text.replace(/\n/g, ' ')}\n`;
                 });
                 md += '\n';
             }

             if (sub.subtasks.length > 0) {
                 renderSubtasks(sub.subtasks, level + 1);
             }
             
             md += `\n`; // Spacer
          });
      };

      renderSubtasks(task.subtasks, 1);
  }

  return md;
};