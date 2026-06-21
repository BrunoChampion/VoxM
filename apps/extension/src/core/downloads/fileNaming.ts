import { sanitizeFilename } from '../utils/sanitizeFilename';

export function formatTimestampForFilename(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}_${h}-${min}-${s}`;
}

export function getVideoFilename(date = new Date()): string {
  return sanitizeFilename(`voxm-recording_${formatTimestampForFilename(date)}.webm`);
}

export function getMarkdownFilename(date = new Date()): string {
  return sanitizeFilename(`voxm-transcript_${formatTimestampForFilename(date)}.md`);
}

export function getJsonFilename(date = new Date()): string {
  return getTranscriptionDebugFilename(date);
}

export function getTranscriptMarkdownFilename(date = new Date()): string {
  return getMarkdownFilename(date);
}

export function getTranscriptionDebugFilename(date = new Date()): string {
  return sanitizeFilename(`voxm-transcription-debug_${formatTimestampForFilename(date)}.json`);
}

export function getSummaryMarkdownFilename(date = new Date()): string {
  return sanitizeFilename(`voxm-summary_${formatTimestampForFilename(date)}.md`);
}

export function getSummaryDebugFilename(date = new Date()): string {
  return sanitizeFilename(`voxm-summary-debug_${formatTimestampForFilename(date)}.json`);
}
