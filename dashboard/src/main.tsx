import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject} from 'react';
import {createRoot} from 'react-dom/client';
import {dashboardApi} from './api';
import {
  Archive,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Command,
  Eye,
  EyeOff,
  FileVideo,
  LibraryBig,
  HardDrive,
  Image,
  LayoutDashboard,
  KeyRound,
  Languages,
  ListFilter,
  LoaderCircle,
  Menu,
  Music2,
  Pencil,
  Play,
  Search,
  Settings2,
  Save,
  SlidersHorizontal,
  Upload,
  Video,
  Volume2,
  X,
  Trash2,
} from './icons';
import type {ApiUsage, Overview, TemplateEntry, VideoArtifact, VoiceSettings, Watermark} from './types';
import './dashboard.css';

type Screen = 'overview' | 'videos' | 'templates' | 'api-usage' | 'settings';

interface DashboardData {
  overview: Overview;
  videos: VideoArtifact[];
  templates: TemplateEntry[];
  watermark: Watermark;
  apiUsage: ApiUsage;
}

const navigation = [
  {id: 'overview', label: 'Tổng quan', icon: LayoutDashboard},
  {id: 'videos', label: 'Kho video', icon: LibraryBig},
  {id: 'templates', label: 'Templates', icon: Boxes},
  {id: 'api-usage', label: 'API usage', icon: Command},
  {id: 'settings', label: 'Hệ thống', icon: Settings2},
] as const;

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString('vi-VN')} B`;
  return `${(bytes / 1024).toLocaleString('vi-VN', {maximumFractionDigits: 0})} KB`;
}

function VideoStatus({status}: {status: VideoArtifact['status']}) {
  const ready = status === 'ready';
  return (
    <span className={`status-chip ${ready ? 'status-chip--ready' : 'status-chip--incomplete'}`}>
      {ready ? <Check aria-hidden="true" size={14} /> : <CircleAlert aria-hidden="true" size={14} />}
      {ready ? 'Đã render' : 'Chưa hoàn tất'}
    </span>
  );
}

function MediaPreview({video, compact = false}: {video: VideoArtifact; compact?: boolean}) {
  if (!video.mediaUrl) {
    return (
      <div className={`media-placeholder ${compact ? 'media-placeholder--compact' : ''}`}>
        <FileVideo aria-hidden="true" size={compact ? 22 : 32} />
        <span>Chưa có MP4</span>
      </div>
    );
  }

  return (
    <video
      className={`video-preview ${compact ? 'video-preview--compact' : ''}`}
      controls
      muted
      preload="metadata"
      src={video.mediaUrl}
      aria-label={`Video ${video.title}`}
    />
  );
}

function EmptyState({onAction}: {onAction: () => void}) {
  return (
    <section className="empty-state">
      <LibraryBig aria-hidden="true" size={32} />
      <h2>Chưa có video để hiển thị.</h2>
      <p>Dashboard sẽ đọc các thư mục trong <code>videos/</code> khi chúng xuất hiện.</p>
      <button className="button button--secondary" onClick={onAction} type="button">
        Tải lại
      </button>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="loading-layout" aria-label="Đang tải dữ liệu dashboard">
      <span className="skeleton skeleton--title" />
      <span className="skeleton skeleton--line" />
      <span className="skeleton skeleton--large" />
      <span className="skeleton skeleton--large" />
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [videoQuery, setVideoQuery] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoArtifact | null>(null);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [pendingWatermark, setPendingWatermark] = useState<File | null>(null);
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string | null>(null);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const [isWatermarkUploading, setIsWatermarkUploading] = useState(false);
  const commandDialog = useRef<HTMLDialogElement>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  const videoDialog = useRef<HTMLDialogElement>(null);
  const watermarkDialog = useRef<HTMLDialogElement>(null);
  const watermarkFileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (initial = false) => {
    setError(null);
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const [overview, videos, templates, watermark, apiUsage] = await Promise.all([
        dashboardApi.overview(),
        dashboardApi.videos(),
        dashboardApi.templates(),
        dashboardApi.watermark(),
        dashboardApi.apiUsage(),
      ]);
      setData({overview, videos, templates, watermark, apiUsage});
      setSelectedTemplateId((current) => current ?? templates[0]?.id ?? null);
    } catch {
      setError('Không thể đọc dữ liệu từ project. Hãy kiểm tra Dashboard API rồi thử lại.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const closeNav = () => setIsNavOpen(false);
  const navigate = (next: Screen) => {
    setScreen(next);
    closeNav();
  };

  const commands = useMemo(
    () => [
      ...navigation.map((item) => ({
        id: item.id,
        label: item.label,
        detail: 'Mở khu vực dashboard',
        action: () => navigate(item.id),
      })),
      {
        id: 'refresh',
        label: 'Làm mới dữ liệu',
        detail: 'Đọc lại registry và thư mục videos',
        action: () => void refresh(),
      },
    ],
    [refresh],
  );
  const filteredCommands = commands.filter((item) =>
    `${item.label} ${item.detail}`.toLocaleLowerCase('vi-VN').includes(commandQuery.toLocaleLowerCase('vi-VN')),
  );

  const openCommand = useCallback(() => {
    setCommandQuery('');
    setCommandIndex(0);
    commandDialog.current?.showModal();
    window.setTimeout(() => commandInput.current?.focus(), 0);
  }, []);

  const closeCommand = () => commandDialog.current?.close();
  const runCommand = (index: number) => {
    const command = filteredCommands[index];
    if (!command) return;
    command.action();
    closeCommand();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (commandDialog.current?.open) closeCommand();
        else openCommand();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCommand]);

  useEffect(() => {
    setCommandIndex(0);
  }, [commandQuery]);

  useEffect(() => {
    if (!pendingWatermark) {
      setWatermarkPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(pendingWatermark);
    setWatermarkPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [pendingWatermark]);

  const visibleVideos = useMemo(() => {
    const query = videoQuery.trim().toLocaleLowerCase('vi-VN');
    if (!query) return data?.videos ?? [];
    return (data?.videos ?? []).filter((video) =>
      `${video.title} ${video.slug} ${video.templateId ?? ''}`.toLocaleLowerCase('vi-VN').includes(query),
    );
  }, [data?.videos, videoQuery]);

  const visibleTemplates = useMemo(() => {
    const query = templateQuery.trim().toLocaleLowerCase('vi-VN');
    if (!query) return data?.templates ?? [];
    return (data?.templates ?? []).filter((template) =>
      `${template.name} ${template.id} ${template.category} ${template.description}`
        .toLocaleLowerCase('vi-VN')
        .includes(query),
    );
  }, [data?.templates, templateQuery]);

  const selectedTemplate = data?.templates.find((template) => template.id === selectedTemplateId) ?? null;

  const openVideo = (video: VideoArtifact) => {
    setSelectedVideo(video);
    window.setTimeout(() => videoDialog.current?.showModal(), 0);
  };

  const selectWatermark = (file: File | null) => {
    setWatermarkError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.png') || (file.type && file.type !== 'image/png')) {
      setPendingWatermark(null);
      setWatermarkError('Chỉ hỗ trợ ảnh PNG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPendingWatermark(null);
      setWatermarkError('Ảnh watermark phải nhỏ hơn hoặc bằng 10 MB.');
      return;
    }
    setPendingWatermark(file);
  };

  const openWatermarkConfirmation = () => {
    if (!pendingWatermark) return;
    watermarkDialog.current?.showModal();
  };

  const closeWatermarkConfirmation = () => {
    if (!isWatermarkUploading) watermarkDialog.current?.close();
  };

  const uploadWatermark = async () => {
    if (!pendingWatermark) return;
    setIsWatermarkUploading(true);
    setWatermarkError(null);
    try {
      const watermark = await dashboardApi.uploadWatermark(pendingWatermark);
      setData((current) => (current ? {...current, watermark} : current));
      setPendingWatermark(null);
      watermarkDialog.current?.close();
    } catch (uploadError) {
      setWatermarkError(uploadError instanceof Error ? uploadError.message : 'Không thể cập nhật watermark.');
      watermarkDialog.current?.close();
    } finally {
      setIsWatermarkUploading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className={`side-nav ${isNavOpen ? 'side-nav--open' : ''}`} aria-label="Điều hướng dashboard">
        <div className="side-nav__brand">
          <Clapperboard aria-hidden="true" size={21} />
          <span>Video Ops</span>
          <button className="icon-button side-nav__close" type="button" onClick={closeNav} aria-label="Đóng điều hướng">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <nav className="side-nav__links">
          {navigation.map(({id, label, icon: Icon}) => (
            <button
              className={`side-nav__link ${screen === id ? 'side-nav__link--active' : ''}`}
              onClick={() => navigate(id)}
              type="button"
              key={id}
              aria-current={screen === id ? 'page' : undefined}
            >
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-nav__note">
          <span className="signal-dot" aria-hidden="true" />
          <span>Local · watermark write</span>
        </div>
      </aside>
      {isNavOpen && <button className="nav-scrim" type="button" onClick={closeNav} aria-label="Đóng điều hướng" />}

      <main className="main-panel">
        <header className="app-bar">
          <button className="icon-button menu-button" type="button" onClick={() => setIsNavOpen(true)} aria-label="Mở điều hướng">
            <Menu aria-hidden="true" size={21} />
          </button>
          <div className="app-bar__context">
            <span className="app-bar__path">Project / Video operations</span>
            <span className="app-bar__mode">Kho video &amp; template</span>
          </div>
          <button className="command-trigger" type="button" onClick={openCommand} aria-label="Tìm trong dashboard, phím tắt Control hoặc Command K">
            <Search aria-hidden="true" size={17} />
            <span>Tìm lệnh</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="button button--primary app-bar__refresh"
            type="button"
            onClick={() => void refresh()}
            data-state={isRefreshing ? 'loading' : undefined}
            disabled={isRefreshing}
          >
            {isRefreshing ? <LoaderCircle className="is-spinning" aria-hidden="true" size={16} /> : <Archive aria-hidden="true" size={16} />}
            <span>{isRefreshing ? 'Đang tải' : 'Làm mới'}</span>
          </button>
        </header>

        <div className="content-area" aria-live="polite">
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <section className="error-state" role="alert">
              <CircleAlert aria-hidden="true" size={28} />
              <h1>Không thể đọc dashboard.</h1>
              <p>{error}</p>
              <button className="button button--primary" type="button" onClick={() => void refresh()}>
                Đọc lại dữ liệu
              </button>
            </section>
          ) : data ? (
            <>
              {screen === 'overview' && (
                <OverviewScreen
                  overview={data.overview}
                  templates={data.templates}
                  apiUsage={data.apiUsage}
                  onVideo={openVideo}
                  onNavigate={navigate}
                  onRefresh={() => void refresh()}
                />
              )}
              {screen === 'videos' && (
                <VideosScreen
                  videos={visibleVideos}
                  query={videoQuery}
                  onQueryChange={setVideoQuery}
                  onVideo={openVideo}
                  onRefresh={() => void refresh()}
                />
              )}
              {screen === 'templates' && (
                <TemplatesScreen
                  templates={visibleTemplates}
                  query={templateQuery}
                  onQueryChange={setTemplateQuery}
                  selected={selectedTemplate}
                  onSelect={setSelectedTemplateId}
                />
              )}
              {screen === 'api-usage' && <ApiUsageScreen apiUsage={data.apiUsage} onSaved={(apiUsage) => setData((current) => current ? {...current, apiUsage} : current)} />}
              {screen === 'settings' && (
                <SystemScreen
                  overview={data.overview}
                  watermark={data.watermark}
                  pendingWatermark={pendingWatermark}
                  previewUrl={watermarkPreviewUrl}
                  uploadError={watermarkError}
                  isUploading={isWatermarkUploading}
                  onWatermarkSelect={selectWatermark}
                  onChooseWatermark={() => watermarkFileInput.current?.click()}
                  onUpload={openWatermarkConfirmation}
                  fileInputRef={watermarkFileInput}
                />
              )}
            </>
          ) : null}
        </div>

        <footer className="status-line">
          <span>Dashboard nội bộ · watermark có xác nhận</span>
          <span>Registry + videos/ · không hiển thị secrets</span>
        </footer>
      </main>

      <dialog
        className="command-dialog"
        ref={commandDialog}
        onClose={() => setCommandQuery('')}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeCommand();
        }}
      >
        <div className="command-dialog__body" role="dialog" aria-modal="true" aria-label="Tìm lệnh dashboard">
          <label className="command-field">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Tìm lệnh</span>
            <input
              ref={commandInput}
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setCommandIndex((current) => Math.min(current + 1, Math.max(filteredCommands.length - 1, 0)));
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCommandIndex((current) => Math.max(current - 1, 0));
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  runCommand(commandIndex);
                }
              }}
              placeholder="Tìm khu vực hoặc thao tác"
            />
            <kbd>Esc</kbd>
          </label>
          <div className="command-results" role="listbox" aria-label="Kết quả lệnh">
            {filteredCommands.length ? (
              filteredCommands.map((item, index) => (
                <button
                  className={`command-result ${index === commandIndex ? 'command-result--active' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={index === commandIndex}
                  key={item.id}
                  onMouseEnter={() => setCommandIndex(index)}
                  onClick={() => runCommand(index)}
                >
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </button>
              ))
            ) : (
              <p className="command-empty">Không có lệnh phù hợp.</p>
            )}
          </div>
          <div className="command-hints">
            <span>↑ ↓ chọn</span>
            <span>↵ mở</span>
            <span>Esc đóng</span>
          </div>
        </div>
      </dialog>

      <dialog
        className="video-dialog"
        ref={videoDialog}
        onClose={() => setSelectedVideo(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) videoDialog.current?.close();
        }}
      >
        {selectedVideo && (
          <div className="video-dialog__body">
            <div className="dialog-heading">
              <div>
                <p>{selectedVideo.templateId ?? 'Chưa xác định template'}</p>
                <h2>{selectedVideo.title}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => videoDialog.current?.close()} aria-label="Đóng video">
                <X aria-hidden="true" size={19} />
              </button>
            </div>
            <MediaPreview video={selectedVideo} />
          </div>
        )}
      </dialog>

      <dialog
        className="confirmation-dialog"
        ref={watermarkDialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeWatermarkConfirmation();
        }}
      >
        <div className="confirmation-dialog__body" role="dialog" aria-modal="true" aria-labelledby="watermark-confirmation-title">
          <div>
            <p className="dialog-overline">Cập nhật watermark</p>
            <h2 id="watermark-confirmation-title">Thay watermark đang dùng?</h2>
            <p className="confirmation-dialog__copy">
              {pendingWatermark ? `${pendingWatermark.name} sẽ ghi đè public/watermark.png.` : 'Watermark hiện tại sẽ được thay thế.'}
            </p>
          </div>
          <div className="confirmation-dialog__actions">
            <button className="button button--secondary" type="button" onClick={closeWatermarkConfirmation} disabled={isWatermarkUploading}>
              Hủy
            </button>
            <button className="button button--primary" type="button" onClick={() => void uploadWatermark()} disabled={isWatermarkUploading}>
              {isWatermarkUploading ? <LoaderCircle className="is-spinning" aria-hidden="true" size={16} /> : <Upload aria-hidden="true" size={16} />}
              {isWatermarkUploading ? 'Đang cập nhật' : 'Xác nhận cập nhật'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function OverviewScreen({
  overview,
  templates,
  apiUsage,
  onVideo,
  onNavigate,
  onRefresh,
}: {
  overview: Overview;
  templates: TemplateEntry[];
  apiUsage: ApiUsage;
  onVideo: (video: VideoArtifact) => void;
  onNavigate: (screen: Screen) => void;
  onRefresh: () => void;
}) {
  const categories = new Set(templates.map((template) => template.category));
  const attentionVideos = overview.recentVideos.filter((video) => video.status !== 'ready');
  return (
    <>
      <section className="page-heading page-heading--overview">
        <div>
          <h1>Kho video, có ngữ cảnh.</h1>
        </div>
        <p>Đọc artifact đã tạo và template đã đăng ký từ workspace hiện tại.</p>
      </section>

      <section className="signal-strip" aria-label="Tóm tắt dữ liệu project">
        <div>
          <span>Template đã đăng ký</span>
          <strong>{overview.templateCount}</strong>
        </div>
        <div>
          <span>Video đã render</span>
          <strong>{overview.renderedVideoCount}</strong>
        </div>
        <div>
          <span>Thư mục video</span>
          <strong>{overview.videoCount}</strong>
        </div>
        <div className="signal-strip__note">
          <span>{categories.size} nhóm template đang có trong registry.</span>
          <button className="inline-action" type="button" onClick={() => onNavigate('templates')}>
            Xem templates <ChevronRight aria-hidden="true" size={16} />
          </button>
        </div>
      </section>

      <section className="overview-activity workbench-section" aria-label="Hoạt động vận hành">
        <div className="overview-activity__chart">
          <div className="section-heading">
            <div>
              <h2>Nhịp hoạt động</h2>
              <p>Request API được dashboard ghi nhận trong {apiUsage.periodDays} ngày gần đây.</p>
            </div>
            <button className="text-action" type="button" onClick={() => onNavigate('api-usage')}>
              API usage <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
          <ApiUsageChart apiUsage={apiUsage} />
        </div>
        <aside className="attention-block" aria-labelledby="attention-heading">
          <div>
            <span className="attention-block__eyebrow">Cần chú ý</span>
            <h2 id="attention-heading">{attentionVideos.length ? `${attentionVideos.length} job chưa hoàn tất` : 'Không có job lỗi gần đây'}</h2>
          </div>
          {attentionVideos.length ? (
            <div className="attention-block__list">
              {attentionVideos.slice(0, 3).map((video) => <button type="button" key={video.slug} onClick={() => onVideo(video)}><span>{video.title}</span><CircleAlert aria-hidden="true" size={16} /></button>)}
            </div>
          ) : <p>Video render gần đây đều đã có output để mở.</p>}
        </aside>
      </section>

      <section className="workbench-section">
        <div className="section-heading">
          <div>
            <h2>Video gần đây</h2>
            <p>Video được sắp theo thời điểm cập nhật artifact hoặc file render.</p>
          </div>
          <button className="button button--secondary" type="button" onClick={() => onNavigate('videos')}>
            Mở kho video
          </button>
        </div>
        {overview.recentVideos.length ? (
          <div className="recent-jobs">
            {overview.recentVideos.map((video) => (
              <article className="recent-video" key={video.slug}>
                <MediaPreview video={video} compact />
                <div className="recent-video__body">
                  <VideoStatus status={video.status} />
                  <h3>{video.title}</h3>
                  <p>{video.templateId ?? 'Template chưa được ghi vào artifact'}</p>
                  <time dateTime={video.updatedAt}>{formatDate(video.updatedAt)}</time>
                  <button className="text-action" type="button" onClick={() => onVideo(video)} disabled={!video.outputAvailable}>
                    <Play aria-hidden="true" size={15} />
                    {video.outputAvailable ? 'Mở video' : 'Chưa có video'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState onAction={onRefresh} />
        )}
      </section>

      <section className="registry-glance">
        <div className="registry-glance__title">
          <Boxes aria-hidden="true" size={23} />
          <div>
            <h2>Template registry</h2>
            <p>Metadata nguồn được đọc trực tiếp từ <code>src/templates/registry.ts</code>.</p>
          </div>
        </div>
        <div className="registry-glance__list">
          {templates.slice(0, 5).map((template) => (
            <button className="registry-row" type="button" key={template.id} onClick={() => onNavigate('templates')}>
              <span>{template.name}</span>
              <code>{template.id}</code>
              <ChevronRight aria-hidden="true" size={17} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function VideosScreen({
  videos,
  query,
  onQueryChange,
  onVideo,
  onRefresh,
}: {
  videos: VideoArtifact[];
  query: string;
  onQueryChange: (value: string) => void;
  onVideo: (video: VideoArtifact) => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <section className="page-heading page-heading--utility">
        <div>
          <h1>Kho video</h1>
        </div>
        <p>Tìm theo nội dung, slug hoặc template. Mỗi dòng trỏ vào artifact thực trong project.</p>
      </section>
      <section className="filter-bar">
        <label className="search-field">
          <span>Tìm video</span>
          <div>
            <Search aria-hidden="true" size={18} />
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Slug hoặc nội dung" />
          </div>
        </label>
        <div className="filter-bar__meta">
          <ListFilter aria-hidden="true" size={17} />
          <span>{videos.length} kết quả</span>
        </div>
      </section>
      {videos.length ? (
        <div className="video-list">
          {videos.map((video) => (
            <article className="video-row" key={video.slug}>
              <MediaPreview video={video} compact />
              <div className="video-row__content">
                <div className="video-row__topline">
                  <VideoStatus status={video.status} />
                  <time dateTime={video.updatedAt}>{formatDate(video.updatedAt)}</time>
                </div>
                <h2>{video.title}</h2>
                <p>{video.context || 'Không có context.txt trong artifact này.'}</p>
                <code>{video.slug}</code>
              </div>
              <div className="video-row__actions">
                <span>{video.templateId ?? 'Không có template.txt'}</span>
                <button className="button button--secondary" type="button" onClick={() => onVideo(video)} disabled={!video.outputAvailable}>
                  <Play aria-hidden="true" size={16} />
                  Xem video
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState onAction={onRefresh} />
      )}
    </>
  );
}

function TemplatesScreen({
  templates,
  query,
  onQueryChange,
  selected,
  onSelect,
}: {
  templates: TemplateEntry[];
  query: string;
  onQueryChange: (value: string) => void;
  selected: TemplateEntry | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <section className="page-heading page-heading--utility">
        <div>
          <h1>Templates</h1>
        </div>
        <p>Khảo sát metadata, voice và background music mà không chỉnh trực tiếp registry.</p>
      </section>
      <section className="template-workbench">
        <div className="template-browser">
          <label className="search-field">
            <span>Tìm template</span>
            <div>
              <Search aria-hidden="true" size={18} />
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tên, ID hoặc category" />
            </div>
          </label>
          <div className="template-list">
            {templates.map((template) => (
              <button
                className={`template-row ${selected?.id === template.id ? 'template-row--selected' : ''}`}
                type="button"
                key={template.id}
                onClick={() => onSelect(template.id)}
                aria-pressed={selected?.id === template.id}
              >
                <span className={`template-row__thumbnail ${template.preview ? '' : 'template-row__thumbnail--empty'}`}>
                  {template.preview ? <img src={template.preview.thumbnailUrl} alt="" /> : <Image aria-hidden="true" size={18} />}
                  {template.preview?.youtubeVideoId && <Play className="template-row__play" aria-hidden="true" size={14} fill="currentColor" />}
                </span>
                <span className="template-row__content">
                  <span className="template-row__title">{template.name}</span>
                  <span className="template-row__meta">
                    <code>{template.id}</code>
                    <span>{template.aspectRatio}</span>
                  </span>
                </span>
              </button>
            ))}
            {!templates.length && <p className="list-empty">Không tìm thấy template phù hợp.</p>}
          </div>
        </div>
        <aside className="template-inspector" aria-live="polite">
          {selected ? <TemplateInspector template={selected} /> : <p>Chọn một template để xem chi tiết.</p>}
        </aside>
      </section>
    </>
  );
}

type VideoLanguage = 'vi' | 'en' | 'es';

const videoLanguages: Array<{id: VideoLanguage; label: string; detail: string}> = [
  {id: 'vi', label: 'Việt Nam', detail: 'Tiếng Việt'},
  {id: 'en', label: 'English', detail: 'English'},
  {id: 'es', label: 'Español', detail: 'Tây Ban Nha'},
];

function TemplateCommand({templateId}: {templateId: string}) {
  const [copyState, setCopyState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [language, setLanguage] = useState<VideoLanguage>('vi');
  const command = `/gen-video --template ${templateId} --language ${language} <nội-dung-video>`;

  const copyCommand = async () => {
    setCopyState('loading');
    try {
      await navigator.clipboard.writeText(command);
      setCopyState('success');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 2400);
  };

  const label = {
    idle: 'Sao chép lệnh',
    loading: 'Đang sao chép',
    success: 'Đã sao chép',
    error: 'Thử lại',
  }[copyState];

  return (
    <section className="template-command" aria-labelledby={`command-${templateId}`}>
      <div className="template-command__heading">
        <div>
          <h3 id={`command-${templateId}`}>Lệnh tạo video</h3>
          <p>Chọn ngôn ngữ cho nội dung, lời đọc và phụ đề.</p>
        </div>
        <Languages aria-hidden="true" size={17} />
      </div>
      <div className="language-picker" role="group" aria-label="Ngôn ngữ tạo video">
        {videoLanguages.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={language === item.id}
            className={`language-picker__option ${language === item.id ? 'language-picker__option--selected' : ''}`}
            onClick={() => setLanguage(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.detail}</small>
          </button>
        ))}
      </div>
      <div className="template-command__row">
        <code>{command}</code>
        <button
          className="button button--primary template-command__copy"
          type="button"
          onClick={() => void copyCommand()}
          disabled={copyState === 'loading'}
          data-state={copyState === 'idle' ? undefined : copyState}
          aria-live="polite"
        >
          {copyState === 'loading' ? <LoaderCircle className="is-spinning" aria-hidden="true" size={15} /> : copyState === 'success' ? <Check aria-hidden="true" size={15} /> : null}
          <span>{label}</span>
        </button>
      </div>
    </section>
  );
}

function TemplateInspector({template}: {template: TemplateEntry}) {
  const preview = template.preview;
  return (
    <article className="template-detail">
      <section className="template-detail__media" aria-label={`Preview ${template.name}`}>
        {preview?.youtubeVideoId ? (
          <iframe
            src={`https://www.youtube.com/embed/${preview.youtubeVideoId}?controls=1&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0`}
            title={`Video demo ${template.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : preview ? (
          <img src={preview.thumbnailUrl} alt={`Ảnh preview ${template.name}`} />
        ) : (
          <div className="template-detail__empty">
            <Image aria-hidden="true" size={28} />
            <span>Chưa có preview</span>
          </div>
        )}
        {preview && (
          <div className="template-detail__media-meta">
            <span>{preview.duration ? `Demo ${preview.duration}` : 'Ảnh preview đã đồng bộ'}</span>
            {preview.sourceTemplateId && <span>Visual: {preview.sourceTemplateId}</span>}
          </div>
        )}
      </section>

      <div className="template-detail__content">
        <header className="inspector-heading">
          <div className="template-detail__tags">
            <span className="template-behavior">{template.behavior}</span>
            <span className="template-category">{template.category}</span>
          </div>
          <h2>{template.name}</h2>
          <code>{template.id}</code>
        </header>
        <p className="inspector-description">{template.description}</p>
        <TemplateCommand templateId={template.id} />
        <dl className="inspector-list">
          <div>
            <dt>Aspect ratio</dt>
            <dd>{template.aspectRatio}</dd>
          </div>
          <div>
            <dt>Gemini voice</dt>
            <dd>{template.voice?.geminiVoice ?? 'Theo cấu hình chung'}</dd>
          </div>
          <div>
            <dt>ElevenLabs voice</dt>
            <dd>{template.voice?.elevenLabsVoiceId ?? 'Theo cấu hình chung'}</dd>
          </div>
          <div>
            <dt>Background music</dt>
            <dd>{template.defaultBgMusic ?? 'Không đặt mặc định'}</dd>
          </div>
          <div>
            <dt>Asset manifest</dt>
            <dd>{template.assetManifestPath ?? 'Không dùng manifest'}</dd>
          </div>
        </dl>
        <div className="inspector-note">
          <SlidersHorizontal aria-hidden="true" size={18} />
          <p>Thay voice và nhạc nền sẽ đi qua workflow có xác nhận ở bước API/job runner tiếp theo.</p>
        </div>
      </div>
    </article>
  );
}

function SystemScreen({
  overview,
  watermark,
  pendingWatermark,
  previewUrl,
  uploadError,
  isUploading,
  onWatermarkSelect,
  onChooseWatermark,
  onUpload,
  fileInputRef,
}: {
  overview: Overview;
  watermark: Watermark;
  pendingWatermark: File | null;
  previewUrl: string | null;
  uploadError: string | null;
  isUploading: boolean;
  onWatermarkSelect: (file: File | null) => void;
  onChooseWatermark: () => void;
  onUpload: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
}) {
  return (
    <>
      <section className="page-heading page-heading--utility">
        <div>
          <h1>Hệ thống</h1>
        </div>
        <p>Trạng thái dashboard không trả về giá trị từ <code>.env</code> hoặc secret.</p>
      </section>
      <section className="system-grid">
        <article className="system-item">
          <HardDrive aria-hidden="true" size={22} />
          <div>
            <h2>Video artifacts</h2>
            <p>{overview.videoCount} thư mục đang được đọc từ <code>videos/</code>.</p>
          </div>
        </article>
        <article className="system-item">
          <Boxes aria-hidden="true" size={22} />
          <div>
            <h2>Template registry</h2>
            <p>{overview.templateCount} template được đọc từ registry TypeScript.</p>
          </div>
        </article>
        <article className="system-item">
          <Volume2 aria-hidden="true" size={22} />
          <div>
            <h2>Secrets</h2>
            <p>Không có giá trị ENV nào được gửi tới trình duyệt.</p>
          </div>
        </article>
        <article className="system-item">
          <Music2 aria-hidden="true" size={22} />
          <div>
            <h2>Watermark</h2>
            <p>Logo dùng chung nằm tại <code>public/watermark.png</code>.</p>
          </div>
        </article>
      </section>
      <section className="watermark-panel">
        <img src={previewUrl ?? watermark.url} alt={pendingWatermark ? 'Bản xem trước watermark sẽ dùng' : 'Watermark hiện tại của project'} />
        <div className="watermark-panel__content">
          <div>
            <h2>{pendingWatermark ? 'Watermark sắp dùng' : 'Watermark hiện tại'}</h2>
            <p>
              {pendingWatermark
                ? `${pendingWatermark.name} · ${formatFileSize(pendingWatermark.size)}`
                : `Cập nhật lần cuối ${formatDate(watermark.updatedAt)} · ${formatFileSize(watermark.size)}`}
            </p>
          </div>
          <div className="watermark-panel__actions">
            <button className="button button--secondary" type="button" onClick={onChooseWatermark}>
              <Upload aria-hidden="true" size={16} />
              Chọn ảnh PNG
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,.png"
              hidden
              onChange={(event) => onWatermarkSelect(event.currentTarget.files?.[0] ?? null)}
            />
            <button className="button button--primary" type="button" onClick={onUpload} disabled={!pendingWatermark || isUploading}>
              <Upload aria-hidden="true" size={16} />
              Áp dụng watermark
            </button>
          </div>
          <p className="watermark-panel__hint">Chỉ nhận PNG tối đa 10 MB. Hệ thống sẽ yêu cầu xác nhận trước khi ghi đè.</p>
          {uploadError && <p className="watermark-panel__error" role="alert">{uploadError}</p>}
        </div>
      </section>
    </>
  );
}

function ApiUsageChart({apiUsage}: {apiUsage: ApiUsage}) {
  const points = apiUsage.daily;
  if (!points.length) return <p className="usage-chart__empty">Chưa có request trong {apiUsage.periodDays} ngày qua để vẽ biểu đồ.</p>;
  const maximum = Math.max(...points.map((item) => item.requests), 1);
  const lastIndex = Math.max(points.length - 1, 1);
  const path = points.map((item, index) => {
    const x = 8 + (index / lastIndex) * 284;
    const y = 82 - (item.requests / maximum) * 66;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return (
    <div className="usage-chart" role="img" aria-label={`Biểu đồ ${points.length} ngày có request API, cao nhất ${maximum} request mỗi ngày`}>
      <svg viewBox="0 0 300 92" preserveAspectRatio="none" aria-hidden="true">
        <path className="usage-chart__rule" d="M 8 16 H 292 M 8 49 H 292 M 8 82 H 292" />
        <path className="usage-chart__line" d={path} />
        {points.map((item, index) => {
          const x = 8 + (index / lastIndex) * 284;
          const y = 82 - (item.requests / maximum) * 66;
          return <circle className="usage-chart__point" key={item.day} cx={x} cy={y} r="2.5" />;
        })}
      </svg>
      <div className="usage-chart__labels"><span>{points[0]?.day}</span><span>{points.at(-1)?.day}</span></div>
    </div>
  );
}

function VoiceSettingsPanel() {
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [provider, setProvider] = useState<'gemini' | 'elevenlabs'>('gemini');
  const [query, setQuery] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { void dashboardApi.voices().then(setSettings).catch((error: Error) => setMessage(error.message)); }, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  const voiceProvider = settings?.[provider];
  const items = (voiceProvider?.voices ?? []).filter((voice) => `${voice.name} ${voice.description}`.toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN')));
  const choose = async (id: string) => { setWorkingId(id); setMessage(null); try { setSettings(await dashboardApi.updateVoice(provider, id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể đổi giọng.'); } finally { setWorkingId(null); } };
  const preview = async (id: string) => { setWorkingId(`preview-${id}`); setMessage(null); try { const blob = await dashboardApi.previewVoice(provider, id); audioRef.current?.pause(); const url = URL.createObjectURL(blob); const audio = new Audio(url); audioRef.current = audio; audio.onended = () => URL.revokeObjectURL(url); await audio.play(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể phát audio preview.'); } finally { setWorkingId(null); } };
  return <section className="voice-settings" aria-labelledby="voice-settings-heading">
    <div className="voice-settings__heading"><div><p className="voice-settings__eyebrow">TTS defaults</p><h2 id="voice-settings-heading">Chọn giọng đọc</h2><p>Thiết lập mặc định trong <code>.env</code>; template có voice riêng vẫn được ưu tiên khi render.</p></div><Volume2 aria-hidden="true" size={20} /></div>
    <div className="voice-settings__tabs" role="tablist" aria-label="Nhà cung cấp giọng đọc">
      {(['gemini', 'elevenlabs'] as const).map((item) => <button className={provider === item ? 'is-active' : ''} type="button" role="tab" aria-selected={provider === item} onClick={() => { setProvider(item); setQuery(''); setMessage(null); }}>{item === 'gemini' ? 'Gemini · 30 voices' : 'ElevenLabs'}</button>)}
    </div>
    {!settings ? <p className="voice-settings__empty">Đang đọc cấu hình giọng…</p> : !voiceProvider?.configured ? <p className="voice-settings__empty">Kết nối {provider === 'gemini' ? 'Gemini' : 'ElevenLabs'} trước để chọn và nghe thử giọng.</p> : <>
      <label className="voice-settings__search"><Search aria-hidden="true" size={15} /><span className="sr-only">Tìm giọng</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc chất giọng" /></label>
      <div className="voice-list">{items.map((voice) => <article className={`voice-option ${voiceProvider.selectedId === voice.id ? 'voice-option--selected' : ''}`} key={voice.id}><button className="voice-option__choice" type="button" onClick={() => void choose(voice.id)} disabled={workingId === voice.id}><span><strong>{voice.name}</strong><small>{voice.description}</small></span>{voiceProvider.selectedId === voice.id && <Check aria-label="Đang dùng" size={16} />}</button><button className="icon-button voice-option__preview" type="button" onClick={() => void preview(voice.id)} disabled={workingId === `preview-${voice.id}`} title={`Nghe thử ${voice.name}`} aria-label={`Nghe thử giọng ${voice.name}`}>{workingId === `preview-${voice.id}` ? <LoaderCircle className="is-spinning" size={16} /> : <Play size={16} />}</button></article>)}</div>
    </>}
    {message && <p className="voice-settings__message" role="alert">{message}</p>}
  </section>;
}

function ApiUsageScreen({apiUsage, onSaved}: {apiUsage: ApiUsage; onSaved: (apiUsage: ApiUsage) => void}) {
  const totalRequests = apiUsage.providers.reduce((total, provider) => total + provider.requests, 0);
  const totalSucceeded = apiUsage.providers.reduce((total, provider) => total + provider.succeeded, 0);
  const keyDialog = useRef<HTMLDialogElement>(null);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const editingProvider = apiUsage.providers.find((provider) => provider.id === editingProviderId) ?? null;

  const openEditor = async (providerId: string) => {
    setEditingProviderId(providerId);
    setKeyVisible(false);
    setKeyMessage(null);
    setSavingProvider(providerId);
    try {
      await dashboardApi.apiKeyConnection(providerId);
      setKeyValue('');
      keyDialog.current?.showModal();
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : 'Không thể đọc API key.');
    } finally {
      setSavingProvider(null);
    }
  };

  const closeEditor = () => {
    keyDialog.current?.close();
    setEditingProviderId(null);
    setKeyValue('');
    setKeyMessage(null);
  };

  const saveKey = async () => {
    if (!editingProvider) return;
    const value = keyValue.trim();
    if (!value) {
      setKeyMessage('Nhập API key trước khi lưu.');
      return;
    }
    setSavingProvider(editingProvider.id);
    setKeyMessage(null);
    try {
      onSaved(await dashboardApi.updateApiKey(editingProvider.id, value));
      closeEditor();
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : 'Không thể lưu API key.');
    } finally {
      setSavingProvider(null);
    }
  };

  const changeConnection = async (providerId: string, action: 'clear' | 'disable') => {
    setSavingProvider(providerId);
    try {
      const provider = apiUsage.providers.find((item) => item.id === providerId);
      onSaved(action === 'clear'
        ? await dashboardApi.clearApiKey(providerId)
        : await dashboardApi.setApiKeyDisabled(providerId, !provider?.disabled));
    } finally {
      setSavingProvider(null);
    }
  };
  return (
    <>
      <section className="page-heading page-heading--utility">
        <div><h1>API usage</h1></div>
        <p>Telemetry cục bộ trong {apiUsage.periodDays} ngày; API key chỉ được lưu trong .env, không nằm trong telemetry.</p>
      </section>
      <section className="usage-overview" aria-labelledby="usage-overview-heading">
        <div className="usage-overview__heading">
          <div><h2 id="usage-overview-heading">Tổng quan request</h2><p>{totalRequests} request đã được ghi nhận · {totalSucceeded} thành công</p></div>
          <span className="usage-overview__period">{apiUsage.periodDays} ngày</span>
        </div>
        <ApiUsageChart apiUsage={apiUsage} />
      </section>
      <section className="usage-provider-grid" aria-label="API key và usage theo nhà cung cấp">
        {apiUsage.providers.map((provider) => (
          <article className={`usage-provider ${provider.disabled ? 'usage-provider--disabled' : ''}`} key={provider.id}>
            <header>
              <div className="usage-provider__identity"><span className="usage-provider__mark" aria-hidden="true"><KeyRound size={17} /></span><div><h2>{provider.label}</h2><p>{provider.operation} · API key cục bộ</p></div></div>
              <div className="connection-actions" aria-label={`Thao tác với ${provider.label}`}>
                <button className="icon-button" type="button" disabled={savingProvider === provider.id} onClick={() => void openEditor(provider.id)} aria-label={`Edit connection ${provider.label}`} title="Edit connection"><Pencil aria-hidden="true" size={17} /></button>
                <button className="icon-button connection-actions__clear" type="button" disabled={!provider.configured || savingProvider === provider.id} onClick={() => void changeConnection(provider.id, 'clear')} aria-label={`Clear key connection ${provider.label}`} title="Clear key connection"><Trash2 aria-hidden="true" size={17} /></button>
                <label className="connection-switch" title={provider.disabled ? `Enable key ${provider.label}` : `Disable key ${provider.label}`}>
                  <span className="sr-only">{provider.disabled ? `Enable key ${provider.label}` : `Disable key ${provider.label}`}</span>
                  <input type="checkbox" checked={!provider.disabled} disabled={!provider.configured || savingProvider === provider.id} onChange={() => void changeConnection(provider.id, 'disable')} />
                  <span className="connection-switch__track" aria-hidden="true"><span /></span>
                </label>
              </div>
            </header>
            <div className="usage-provider__meter"><div><span>Request</span><strong>{provider.requests}</strong></div><div className="usage-provider__track"><span style={{'--usage-progress': `${provider.requests ? 100 : 0}%`} as CSSProperties} /></div><p>{provider.succeeded} thành công · {provider.failed} lỗi</p></div>
            <dl><div><dt>{provider.operation === 'TTS' ? 'Ký tự gửi' : 'Audio gửi'}</dt><dd>{provider.operation === 'TTS' ? provider.inputChars.toLocaleString('vi-VN') : formatFileSize(provider.inputBytes)}</dd></div><div><dt>Lần ghi nhận cuối</dt><dd>{provider.latestAt ? formatDate(provider.latestAt) : '—'}</dd></div></dl>
          </article>
        ))}
      </section>
      <VoiceSettingsPanel />
      <dialog className="api-key-dialog" ref={keyDialog} onClose={closeEditor} onClick={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
        {editingProvider && <form className="api-key-dialog__body" onSubmit={(event) => { event.preventDefault(); void saveKey(); }}>
          <div className="dialog-heading"><div><p>{editingProvider.keyName}</p><h2>Edit connection</h2></div><button className="icon-button" type="button" onClick={closeEditor} aria-label="Đóng cửa sổ chỉnh key"><X aria-hidden="true" size={19} /></button></div>
          <label className="api-key-dialog__label" htmlFor="editing-api-key">API key · {editingProvider.label}</label>
          <div className="api-key-dialog__field"><KeyRound aria-hidden="true" size={16} /><input id="editing-api-key" autoComplete="off" type={keyVisible ? 'text' : 'password'} value={keyValue} onChange={(event) => setKeyValue(event.target.value)} placeholder="Dán API key" autoFocus /><button className="icon-button" type="button" aria-label={keyVisible ? 'Ẩn API key' : 'Hiện API key'} onClick={() => setKeyVisible((visible) => !visible)}>{keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          {keyMessage && <p className="api-key-dialog__message" role="alert">{keyMessage}</p>}
          <div className="api-key-dialog__actions"><button className="button button--secondary" type="button" onClick={closeEditor} disabled={savingProvider === editingProvider.id}>Hủy</button><button className="button button--primary" type="submit" disabled={savingProvider === editingProvider.id}>{savingProvider === editingProvider.id ? <LoaderCircle className="is-spinning" size={16} /> : <Save size={16} />} {savingProvider === editingProvider.id ? 'Đang lưu' : 'Lưu key'}</button></div>
        </form>}
      </dialog>
      <section className="usage-recent" aria-labelledby="recent-api-request-heading">
        <div className="section-heading"><div><h2 id="recent-api-request-heading">Request gần đây</h2><p>Chỉ metadata vận hành được hiển thị.</p></div></div>
        {apiUsage.recent.length ? <div className="usage-recent__list">{apiUsage.recent.map((event, index) => <div className="usage-event" key={`${event.at}-${event.provider}-${index}`}><div><strong>{event.provider}</strong><span>{event.operation}{event.model ? ` · ${event.model}` : ''}{event.slug ? ` · ${event.slug}` : ''}</span></div><span className={`status-chip ${event.status === 'succeeded' ? 'status-chip--ready' : 'status-chip--incomplete'}`}>{event.status === 'succeeded' ? 'Thành công' : 'Lỗi'}</span><time dateTime={event.at}>{formatDate(event.at)}</time></div>)}</div> : <p className="usage-empty">Dữ liệu sẽ xuất hiện sau khi chạy TTS hoặc transcribe.</p>}
        <p className="usage-note">Đây là usage ghi nhận bởi project, không phải quota hay chi phí chính thức của nhà cung cấp.</p>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
