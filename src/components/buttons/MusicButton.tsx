'use client';

import { useCallback, useEffect, useState } from 'react';
import { sound } from '@pixi/sound';
import { useQuery } from 'convex/react';

import Button from './Button';
import { api } from '../../../convex/_generated/api';

export default function MusicButton() {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    if (musicUrl) {
      sound.add('background', musicUrl).loop = true;
    }
  }, [musicUrl]);

  const flipSwitch = useCallback(async () => {
    if (isPlaying) {
      sound.stop('background');
    } else {
      await sound.play('background');
    }
    setPlaying((prev) => !prev);
  }, [isPlaying]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'm' || event.key === 'M') {
        void flipSwitch();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [flipSwitch]);

  return (
    <Button
      onClick={() => void flipSwitch()}
      className="hidden lg:block"
      title="Play AI generated music (press m to play/mute)"
      imgUrl="/assets/volume.svg"
    >
      {isPlaying ? 'Mute' : 'Music'}
    </Button>
  );
}
