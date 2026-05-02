'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';

import Game from './Game';
import MusicButton from './buttons/MusicButton';
import Button from './buttons/Button';
import InteractButton from './buttons/InteractButton';
import FreezeButton from './FreezeButton';
import LoginButton from './buttons/LoginButton';
import UserButton from './buttons/UserButton';
import PoweredByConvex from './PoweredByConvex';
import { MAX_HUMAN_PLAYERS } from '../../convex/constants';

export default function Home() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { status } = useSession();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
      <PoweredByConvex />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="font-body">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
          </DialogHeader>
          <p>
            Welcome to AI Zoo. AI Zoo supports both anonymous <i>spectators</i> and logged in{' '}
            <i>interactivity</i>.
          </p>
          <h2 className="text-4xl mt-4">Spectating</h2>
          <p>
            Click and drag to pan the safari, and scroll in and out to zoom. Click any animal to
            view its chat history.
          </p>
          <h2 className="text-4xl mt-4">Interactivity</h2>
          <p>
            If you log in, you can join the simulation and directly talk to the animals. After
            logging in, click "Interact" and your character will appear somewhere on the map with a
            highlighted circle underneath it.
          </p>
          <p className="text-2xl mt-2">Controls:</p>
          <p className="mt-4">Click to navigate around.</p>
          <p className="mt-4">
            To talk to an animal, click on it and then click "Start conversation," which will ask it
            to walk towards you. Once it's nearby, the conversation will start, and you can speak to
            each other. You can leave at any time by closing the conversation pane or moving away.
            Animals may propose a conversation to you — you'll see a button to accept in the
            messages panel.
          </p>
          <p className="mt-4">
            AI Zoo supports {MAX_HUMAN_PLAYERS} humans at a time. If you're idle for five minutes,
            you'll be automatically removed from the simulation.
          </p>
        </DialogContent>
      </Dialog>

      <div className="p-3 absolute top-0 right-0 z-10 text-2xl">
        {status === 'authenticated' ? <UserButton /> : <LoginButton />}
      </div>

      <div className="w-full lg:h-screen min-h-screen relative isolate overflow-hidden lg:p-8 shadow-2xl flex flex-col justify-start">
        <h1 className="mx-auto text-4xl p-3 sm:text-8xl lg:text-9xl font-bold font-display leading-none tracking-wide game-title w-full text-left sm:text-center sm:w-auto">
          AI Zoo
        </h1>

        <div className="max-w-xs md:max-w-xl lg:max-w-none mx-auto my-4 text-center text-base sm:text-xl md:text-2xl text-white leading-tight shadow-solid">
          A virtual safari where 12 zodiac animals live, chat and socialize.
          {status !== 'authenticated' && (
            <>
              <div className="my-1.5 sm:my-0" />
              Log in to join the safari
              <br className="block sm:hidden" /> and the conversation!
            </>
          )}
        </div>

        <Game />

        <footer className="justify-end bottom-0 left-0 w-full flex items-center mt-4 gap-3 p-6 flex-wrap pointer-events-none">
          <div className="flex gap-4 flex-grow pointer-events-none">
            <FreezeButton />
            <MusicButton />
            <Button href="https://github.com/a16z-infra/ai-town" imgUrl="/assets/star.svg">
              Star
            </Button>
            <InteractButton />
            <Button imgUrl="/assets/help.svg" onClick={() => setHelpOpen(true)}>
              Help
            </Button>
          </div>
          <a href="https://a16z.com">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="w-8 h-8 pointer-events-auto" src="/assets/a16z.png" alt="a16z" />
          </a>
          <a href="https://convex.dev/c/ai-town">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="w-20 h-8 pointer-events-auto" src="/assets/convex.svg" alt="Convex" />
          </a>
        </footer>
        <Toaster />
      </div>
    </main>
  );
}
