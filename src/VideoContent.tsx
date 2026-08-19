import React from 'react';
import {AbsoluteFill, Audio, Sequence, Series, staticFile} from 'remotion';
import {Layout, SceneBody, SceneEnding, SceneHook, type NewsTechDarkSpec} from './templates/news/tech-dark';
import {TRANSITION_SFX} from './templates/creative/free-style-sfx';
import specData from '../videos/2026-08-19-soft-delete-vs-hard-delete-what-is-the/spec.json';

const spec = specData as NewsTechDarkSpec;
const sfx = ['whoosh', 'pageTurn', 'whoosh', 'whip', 'pageTurn', 'whoosh', 'pageTurn'] as const;

export const VideoContent: React.FC<{slug: string}> = ({slug}) => (
  <Layout slug={slug} bgMusic={spec.video.bgMusic ?? null}>
    <Audio src={staticFile(`${slug}/voice.mp3`)} />
    {spec.scenes.map((scene, index) => (
      <Sequence key={`sfx-${scene.startFrame}`} from={scene.startFrame}>
        <Audio src={TRANSITION_SFX[sfx[index]]} volume={index === 0 ? 0.12 : 0.1} />
      </Sequence>
    ))}
    <AbsoluteFill>
      <Series>
        {spec.scenes.map((scene, i) => (
          <Series.Sequence key={i} durationInFrames={scene.durationFrames} premountFor={30}>
            {scene.type === 'hook' && scene.hook && <SceneHook {...scene.hook} />}
            {scene.type === 'body' && scene.body && <SceneBody {...scene.body} />}
            {scene.type === 'ending' && scene.ending && <SceneEnding {...scene.ending} />}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  </Layout>
);
