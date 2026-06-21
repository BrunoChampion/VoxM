import { AppError } from '../errors/AppError';
import { sleep } from '../utils/sleep';
import type { ErrorCode } from '../errors/errorCodes';
import type { MeetingSummaryInput, MeetingSummaryJson } from './summaryTypes';

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SUMMARY_MODEL = 'llama-3.3-70b-versatile';

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GroqSummaryOptions = {
  apiKey: string;
  retries?: number;
};

type RawSummary = {
  metadata?: unknown;
  attendance?: unknown;
  agenda?: unknown;
  executiveSummary?: unknown;
  discussedTopics?: unknown;
  decisions?: unknown;
  actionItems?: unknown;
  openQuestions?: unknown;
  parkingLot?: unknown;
  risksAndBlockers?: unknown;
  followUpResearch?: unknown;
  nextMeetingTopics?: unknown;
  timelineHighlights?: unknown;
  attachmentsAndReferences?: unknown;
  confidenceNotes?: unknown;
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

function classifyGroqSummaryError(status: number): { code: ErrorCode; message: string } {
  if (status === 401) {
    return {
      code: 'GROQ_INVALID_API_KEY',
      message: 'Invalid Groq API key. Please check your API key in settings.',
    };
  }
  if (status === 429) {
    return {
      code: 'GROQ_RATE_LIMITED',
      message: 'Groq rate limit reached while generating the meeting summary. Retry later.',
    };
  }
  if (status === 402 || status === 403) {
    return {
      code: 'GROQ_QUOTA_EXCEEDED',
      message: 'Groq quota or billing issue. Please check your Groq account.',
    };
  }
  return {
    code: 'GROQ_SUMMARY_FAILED',
    message: `Groq summary generation failed (${status}). Please retry later.`,
  };
}

export async function generateMeetingSummary(
  input: MeetingSummaryInput,
  options: GroqSummaryOptions,
): Promise<MeetingSummaryJson> {
  const maxAttempts = Math.max(1, options.retries ?? 3);
  const delays = [0, 2_000, 8_000];
  let nextRetryDelayMs: number | undefined;
  let lastError: { code: ErrorCode; message: string } | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(nextRetryDelayMs ?? delays[attempt] ?? 8_000);
      nextRetryDelayMs = undefined;
    }

    try {
      const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SUMMARY_MODEL,
          temperature: 0.2,
          max_completion_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You generate complete, factual meeting minutes for professionals. Return only valid JSON. Write the entire output in the same language as the transcript. Capture every materially important topic, decision, action, unresolved issue, and follow-up from the transcript. Do not compress complex meetings into a short generic summary. Do not invent owners, dates, decisions, or action items.',
            },
            {
              role: 'user',
              content: buildSummaryPrompt(input),
            },
          ],
        }),
      });

      if (!response.ok) {
        await response.text().catch(() => '');
        const classified = classifyGroqSummaryError(response.status);
        lastError = classified;

        if (response.status === 401 || response.status === 402 || response.status === 403) {
          throw new AppError(classified.code, classified.message);
        }

        if (isRetryableStatus(response.status) && attempt < maxAttempts - 1) {
          if (response.status === 429) {
            nextRetryDelayMs = parseRetryAfterMs(response.headers?.get('retry-after') ?? null);
          }
          continue;
        }

        throw new AppError(classified.code, classified.message);
      }

      const data = (await response.json()) as GroqChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError('GROQ_SUMMARY_FAILED', 'Groq returned an empty summary response.');
      }

      return normalizeSummary(input, parseSummaryJson(content));
    } catch (error) {
      if (error instanceof AppError) {
        lastError = { code: error.code, message: error.message };
        if (
          error.code === 'GROQ_INVALID_API_KEY' ||
          error.code === 'GROQ_QUOTA_EXCEEDED' ||
          error.code === 'GROQ_RATE_LIMITED'
        ) {
          throw error;
        }
        if (attempt === maxAttempts - 1) throw error;
        continue;
      }

      const message = error instanceof Error ? error.message : 'Unknown summary error';
      lastError = { code: 'GROQ_SUMMARY_FAILED', message };
      if (attempt === maxAttempts - 1) {
        throw new AppError('GROQ_SUMMARY_FAILED', message, error);
      }
    }
  }

  throw new AppError(
    lastError?.code ?? 'GROQ_SUMMARY_FAILED',
    lastError?.message ?? 'Summary generation failed after retries.',
  );
}

export function buildSummaryPrompt(input: MeetingSummaryInput): string {
  return [
    'Create a complete meeting summary from this transcript.',
    '',
    'Return JSON with exactly these keys:',
    '- metadata: object with { title, date, duration, source }',
    '- attendance: object with { present, absent, notetaker }',
    '- agenda: array of agenda item titles inferred from the conversation flow',
    '- executiveSummary: string',
    '- discussedTopics: array of { title, summary, keyPoints, openIssues, evidence }',
    '- decisions: array of { decision, rationale, evidence }',
    '- actionItems: array of { task, owner, dueDate, acceptanceCriteria, linkedArtifacts, status, evidence }',
    '- openQuestions: array of { question, context, owner }',
    '- parkingLot: array of { item, nextStep, suggestedOwner }',
    '- risksAndBlockers: array of strings',
    '- followUpResearch: array of strings',
    '- nextMeetingTopics: array of strings',
    '- timelineHighlights: array of { timestamp, note }',
    '- attachmentsAndReferences: array of strings',
    '- confidenceNotes: array of strings',
    '',
    'Rules:',
    '- Use the meeting-minutes structure: metadata, attendance, agenda, summary, decisions, action items, notes by agenda item, parking lot, risks, next meeting, attachments, version notes.',
    `- Output language: ${input.transcriptJson.language ?? 'infer from transcript'}. If this says "infer from transcript", identify the transcript language and write the entire JSON content in that same language.`,
    '- Do not translate the meeting into English unless the transcript itself is primarily English.',
    '- Keep it concise but complete. For a 15-minute meeting, include all meaningful topics discussed across the full 15 minutes, not only the first or easiest topic.',
    '- Each discussed topic should include 2-6 concrete keyPoints when the transcript supports them.',
    '- Preserve uncertainty. If owner, due date, or artifacts are unclear, omit that field. Do not output strings like "Unknown", "unknown", "N/A", or "None" inside action item fields.',
    '- For actionItems, include acceptanceCriteria when the transcript implies what done means.',
    '- Use transcript timestamps as evidence when possible.',
    '- If the transcript has failed chunk markers, mention that limitation in confidenceNotes.',
    '',
    `Recording ID: ${input.recordingId}`,
    `Duration ms: ${input.transcriptJson.durationMs}`,
    `Failed transcript chunks: ${input.transcriptJson.failedChunks.length}`,
    '',
    'Transcript:',
    input.transcriptMarkdown,
  ].join('\n');
}

function parseSummaryJson(content: string): RawSummary {
  try {
    return JSON.parse(content) as RawSummary;
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1)) as RawSummary;
    }
    throw new AppError('GROQ_SUMMARY_FAILED', 'Groq returned invalid summary JSON.');
  }
}

function normalizeSummary(input: MeetingSummaryInput, raw: RawSummary): MeetingSummaryJson {
  return {
    recordingId: input.recordingId,
    generatedAt: new Date().toISOString(),
    modelProvider: 'groq',
    modelName: SUMMARY_MODEL,
    transcriptStats: {
      durationMs: input.transcriptJson.durationMs,
      segmentCount: input.transcriptJson.segments.length,
      failedChunkCount: input.transcriptJson.failedChunks.length,
    },
    metadata: {
      title: optionalStringField(asRecord(raw.metadata), 'title'),
      date: optionalStringField(asRecord(raw.metadata), 'date'),
      duration: optionalStringField(asRecord(raw.metadata), 'duration'),
      source: optionalStringField(asRecord(raw.metadata), 'source') ?? 'Browser tab recording',
      minutesAuthor: 'VoxM',
    },
    attendance: {
      present: asStringArray(asRecord(raw.attendance).present).filter(notPlaceholder),
      absent: asStringArray(asRecord(raw.attendance).absent).filter(notPlaceholder),
      notetaker: optionalCleanStringField(asRecord(raw.attendance), 'notetaker'),
    },
    agenda: asStringArray(raw.agenda),
    executiveSummary: asString(raw.executiveSummary),
    discussedTopics: asArray(raw.discussedTopics).map((item) => ({
      title: asStringField(item, 'title', 'Untitled topic'),
      summary: asStringField(item, 'summary'),
      keyPoints: asStringArray(item.keyPoints),
      openIssues: asStringArray(item.openIssues),
      evidence: optionalStringField(item, 'evidence'),
    })),
    decisions: asArray(raw.decisions).map((item) => ({
      decision: asStringField(item, 'decision'),
      rationale: optionalStringField(item, 'rationale'),
      evidence: optionalStringField(item, 'evidence'),
    })),
    actionItems: asArray(raw.actionItems).map((item) => ({
      task: asStringField(item, 'task'),
      owner: optionalCleanStringField(item, 'owner'),
      dueDate: optionalCleanStringField(item, 'dueDate'),
      acceptanceCriteria: optionalCleanStringField(item, 'acceptanceCriteria'),
      linkedArtifacts: asStringArray(item.linkedArtifacts).filter(notPlaceholder),
      status: normalizeStatus(optionalStringField(item, 'status')),
      evidence: optionalStringField(item, 'evidence'),
    })),
    openQuestions: asArray(raw.openQuestions).map((item) => ({
      question: asStringField(item, 'question'),
      context: optionalStringField(item, 'context'),
      owner: optionalCleanStringField(item, 'owner'),
    })),
    parkingLot: asArray(raw.parkingLot).map((item) => ({
      item: asStringField(item, 'item'),
      nextStep: optionalCleanStringField(item, 'nextStep'),
      suggestedOwner: optionalCleanStringField(item, 'suggestedOwner'),
    })),
    risksAndBlockers: asStringArray(raw.risksAndBlockers),
    followUpResearch: asStringArray(raw.followUpResearch),
    nextMeetingTopics: asStringArray(raw.nextMeetingTopics),
    timelineHighlights: asArray(raw.timelineHighlights).map((item) => ({
      timestamp: asStringField(item, 'timestamp'),
      note: asStringField(item, 'note'),
    })),
    attachmentsAndReferences: asStringArray(raw.attachmentsAndReferences),
    version: {
      value: '1.0',
      lastUpdated: new Date().toISOString(),
      changes: 'Initial machine-generated minutes from transcript.',
    },
    confidenceNotes: asStringArray(raw.confidenceNotes),
  };
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter((item) => item.length > 0)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asStringField(item: Record<string, unknown>, key: string, fallback = ''): string {
  return asString(item[key], fallback);
}

function optionalStringField(item: Record<string, unknown>, key: string): string | undefined {
  const value = asString(item[key]);
  return value || undefined;
}

function optionalCleanStringField(item: Record<string, unknown>, key: string): string | undefined {
  const value = optionalStringField(item, key);
  return value && notPlaceholder(value) ? value : undefined;
}

function notPlaceholder(value: string): boolean {
  return !['unknown', 'n/a', 'na', 'none', 'null', 'undefined'].includes(value.trim().toLowerCase());
}

function normalizeStatus(
  value: string | undefined,
): MeetingSummaryJson['actionItems'][number]['status'] {
  if (!value || !notPlaceholder(value)) return undefined;
  if (
    value === 'open' ||
    value === 'in_progress' ||
    value === 'blocked' ||
    value === 'done' ||
    value === 'unknown'
  ) {
    return value;
  }
  return undefined;
}
