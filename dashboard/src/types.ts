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
