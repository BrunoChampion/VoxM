export type RecordingState =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'stopping'
  | 'transcribing'
  | 'completed'
  | 'failed';

export type RecordingStatus =
  | 'preparing'
  | 'recording'
  | 'stopping'
  | 'video_saved'
  | 'transcribing'
  | 'completed'
  | 'failed'
  | 'partial_video_failed'
  | 'partial_transcript_failed';
