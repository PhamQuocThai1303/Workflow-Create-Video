import type {Overview, TemplateEntry, VideoArtifact, Watermark} from './types';

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, {headers: {Accept: 'application/json'}});
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json() as Promise<T>;
}

async function uploadWatermark(file: File): Promise<Watermark> {
  const response = await fetch('/api/watermark', {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'image/png'},
    body: file,
  });
  const payload = (await response.json().catch(() => null)) as Watermark | {error?: string} | null;
  if (!response.ok) throw new Error(payload && 'error' in payload ? payload.error ?? 'Could not upload watermark.' : 'Could not upload watermark.');
  return payload as Watermark;
}

export const dashboardApi = {
  overview: () => request<Overview>('/api/overview'),
  videos: () => request<VideoArtifact[]>('/api/videos'),
  templates: () => request<TemplateEntry[]>('/api/templates'),
  watermark: () => request<Watermark>('/api/watermark'),
  uploadWatermark,
};
