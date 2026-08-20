export type VideoStatus = 'ready' | 'incomplete';

export interface VideoArtifact {
  slug: string;
  title: string;
  context: string;
  templateId: string | null;
  updatedAt: string;
  status: VideoStatus;
  outputAvailable: boolean;
  mediaUrl: string | null;
}

export interface TemplateEntry {
  id: string;
  behavior: 'fixed' | 'hybrid' | 'creative';
  name: string;
  category: string;
  description: string;
  aspectRatio: '9:16' | '16:9';
  assetManifestPath: string | null;
  defaultBgMusic: string | null;
  voice: {
    elevenLabsVoiceId: string | null;
    geminiVoice: string | null;
  } | null;
  preview: TemplatePreview | null;
}

export interface TemplatePreview {
  thumbnailUrl: string;
  youtubeVideoId: string | null;
  duration: string | null;
  sourceTemplateId: string | null;
}

export interface Overview {
  templateCount: number;
  videoCount: number;
  renderedVideoCount: number;
  recentVideos: VideoArtifact[];
}

export interface Watermark {
  updatedAt: string;
  size: number;
  url: string;
}

export interface ApiUsageProvider {
  id: string;
  label: string;
  operation: string;
  keyName: string;
  configured: boolean;
  disabled: boolean;
  requests: number;
  succeeded: number;
  failed: number;
  inputChars: number;
  inputBytes: number;
  outputBytes: number;
  durationSeconds: number;
  latestAt: string | null;
}

export interface ApiUsageEvent {
  at: string;
  provider: string;
  operation: string;
  status: 'succeeded' | 'failed';
  model?: string;
  slug?: string;
  inputChars?: number;
  inputBytes?: number;
  outputBytes?: number;
  durationSeconds?: number;
  latencyMs?: number;
}

export interface ApiUsageDay {
  day: string;
  requests: number;
  succeeded: number;
  failed: number;
}

export interface ApiUsage {
  periodDays: number;
  providers: ApiUsageProvider[];
  recent: ApiUsageEvent[];
  daily: ApiUsageDay[];
}

export interface ApiKeyConnection {
  providerId: string;
  configured: boolean;
}

export interface VoiceOption { id: string; name: string; description: string; }
export interface VoiceProvider { configured: boolean; selectedId: string; voices: VoiceOption[]; }
export interface VoiceSettings { gemini: VoiceProvider; elevenlabs: VoiceProvider; }
