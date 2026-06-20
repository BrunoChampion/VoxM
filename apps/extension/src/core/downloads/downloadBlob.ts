import { AppError } from '../errors/AppError';
import type { ErrorCode } from '../errors/errorCodes';

type DownloadUrl = {
  url: string;
  revoke: () => void;
};

async function createDownloadUrl(blob: Blob): Promise<DownloadUrl> {
  if (typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);
    return {
      url,
      revoke: () => URL.revokeObjectURL(url),
    };
  }

  const url = await blobToDataUrl(blob);
  return {
    url,
    revoke: () => undefined,
  };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${getDataUrlMediaType(blob)};base64,${btoa(binary)}`;
}

function getDataUrlMediaType(blob: Blob): string {
  const type = blob.type.split(';')[0]?.trim();
  return type || 'application/octet-stream';
}

async function downloadBlobWithErrorCode(
  blob: Blob,
  filename: string,
  errorCode: ErrorCode,
): Promise<{ downloadId: number }> {
  const downloadUrl = await createDownloadUrl(blob);

  try {
    const downloadId = await chrome.downloads.download({
      url: downloadUrl.url,
      filename,
      saveAs: false,
    });

    if (downloadId === undefined) {
      throw new AppError(errorCode, 'Download was cancelled or failed to start.');
    }

    return { downloadId };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(errorCode, `Failed to download ${filename}.`, error);
  } finally {
    setTimeout(downloadUrl.revoke, 60_000);
  }
}

export function downloadVideoBlob(
  blob: Blob,
  filename: string,
): Promise<{ downloadId: number }> {
  return downloadBlobWithErrorCode(blob, filename, 'VIDEO_DOWNLOAD_FAILED');
}

export function downloadTranscriptText(
  text: string,
  filename: string,
): Promise<{ downloadId: number }> {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  return downloadBlobWithErrorCode(blob, filename, 'TRANSCRIPT_DOWNLOAD_FAILED');
}
