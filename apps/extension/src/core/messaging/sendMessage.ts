import type { AnyMessage, MessageResponse } from './messageTypes';

export async function sendMessage<T = unknown>(message: AnyMessage): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T> | undefined;

  if (!response) {
    throw new Error('No response from message');
  }

  if (!response.success) {
    const error = new Error(response.error.message);
    (error as Error & { code?: string }).code = response.error.code;
    throw error;
  }

  return response.data;
}
