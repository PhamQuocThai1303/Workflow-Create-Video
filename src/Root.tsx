import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Video, type VideoProps} from './Video';

// These values are updated by the coder agent after each video generation.
const defaultSlug = '2026-08-19-soft-delete-vs-hard-delete-what-is-the';
const defaultDuration = 2584;
const defaultWidth = 1080;
const defaultHeight = 1920;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Video"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component={Video as any}
    durationInFrames={defaultDuration}
    fps={30}
    width={defaultWidth}
    height={defaultHeight}
    defaultProps={{slug: defaultSlug} satisfies VideoProps}
  />
);

registerRoot(RemotionRoot);
