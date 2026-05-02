'use client';

import Button from './buttons/Button';
import { useDefaultWorldStatus } from '../hooks/useWorldStatus';
import { WORKER_URL } from '@/lib/supabase';

// Toggles the world's lifecycle by hitting the Worker. The Worker exposes a
// `/freeze` and `/resume` route per world; the DO reads world_status before
// each tick so the change takes effect within ~1s.
export default function FreezeButton() {
  const status = useDefaultWorldStatus();
  if (!status) return null;
  const frozen = status.status === 'stoppedByDeveloper';

  const flipSwitch = async () => {
    if (!WORKER_URL) return;
    await fetch(`${WORKER_URL}/world/${status.world_id}/${frozen ? 'resume' : 'freeze'}`, {
      method: 'POST',
    });
  };

  return (
    <Button
      onClick={() => void flipSwitch()}
      className="hidden lg:block"
      title="When freezing a world, the agents will take some time to stop what they are doing before they become frozen."
      imgUrl="/assets/star.svg"
    >
      {frozen ? 'Unfreeze' : 'Freeze'}
    </Button>
  );
}
