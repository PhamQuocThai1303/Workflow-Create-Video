import type {ApiKeyConnection, ApiUsage, Overview, TemplateEntry, VideoArtifact, Watermark} from './types';

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

async function updateApiKey(providerId: string, value: string): Promise<ApiUsage> {
  const response = await fetch('/api/api-keys', {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify({providerId, value}),
  });
  const payload = await response.json().catch(() => null) as ApiUsage | {error?: string} | null;
  if (!response.ok) throw new Error(payload && 'error' in payload ? payload.error ?? 'Could not update API key.' : 'Could not update API key.');
  return payload as ApiUsage;
}

async function apiKeyConnection(providerId: string): Promise<ApiKeyConnection> {
  return request<ApiKeyConnection>(`/api/api-keys/${encodeURIComponent(providerId)}`);
}

async function changeApiKeyConnection(providerId: string, method: 'DELETE' | 'PATCH', disabled?: boolean): Promise<ApiUsage> {
  const response = await fetch(`/api/api-keys/${encodeURIComponent(providerId)}`, {
    method,
    headers: {Accept: 'application/json', ...(method === 'PATCH' ? {'Content-Type': 'application/json'} : {})},
    body: method === 'PATCH' ? JSON.stringify({disabled}) : undefined,
  });
  const payload = await response.json().catch(() => null) as ApiUsage | {error?: string} | null;
  if (!response.ok) throw new Error(payload && 'error' in payload ? payload.error ?? 'Could not update API key.' : 'Could not update API key.');
  return payload as ApiUsage;
}

export const dashboardApi = {
  overview: () => request<Overview>('/api/overview'),
  videos: () => request<VideoArtifact[]>('/api/videos'),
  templates: () => request<TemplateEntry[]>('/api/templates'),
  watermark: () => request<Watermark>('/api/watermark'),
  apiUsage: () => request<ApiUsage>('/api/api-usage'),
  apiKeyConnection,
  clearApiKey: (providerId: string) => changeApiKeyConnection(providerId, 'DELETE'),
  setApiKeyDisabled: (providerId: string, disabled: boolean) => changeApiKeyConnection(providerId, 'PATCH', disabled),
  updateApiKey,
  uploadWatermark,
};
