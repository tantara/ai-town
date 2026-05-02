'use client';

import { useCallback, useEffect, useState } from 'react';
import { sound } from '@pixi/sound';

import Button from './Button';
import { useBackgroundMusic } from '../../hooks/useBackgroundMusic';

export default function MusicButton() {
  const musicUrl = useBackgroundMusic();
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    if (musicUrl) sound.add('background', musicUrl).loop = true;
  }, [musicUrl]);

  const flipSwitch = useCallback(async () => {
    if (isPlaying) sound.stop('background');
    else await sound.play('background');
    setPlaying((prev) => !prev);
  }, [isPlaying]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') void flipSwitch();
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
