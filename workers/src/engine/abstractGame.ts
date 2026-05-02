// Engine port. The Convex version separated input loading and engine save
// into mutations; here we run everything in-memory inside the Durable Object,
// and only persist via the injected Repository.

import type { DB } from '../db/supabase';
import * as repo from '../db/repository';
import type { EngineDoc, EngineUpdate, GameStateDiff, InputDoc } from '../aiTown/types';

export abstract class AbstractGame {
  abstract tickDuration: number;
  abstract stepDuration: number;
  abstract maxTicksPerStep: number;
  abstract maxInputsPerStep: number;

  constructor(public engine: EngineDoc) {}

  abstract handleInput(now: number, name: string, args: object): unknown;
  abstract tick(now: number): void;
  beginStep(_now: number) {}
  abstract takeDiff(): GameStateDiff;

  /**
   * Run one engine step:
   *   1. Pull pending inputs from the queue.
   *   2. Tick simulation forward up to `now`.
   *   3. Build an EngineUpdate + GameStateDiff and let the caller persist.
   */
  async runStep(
    db: DB,
    now: number,
  ): Promise<{ update: EngineUpdate; diff: GameStateDiff }> {
    const inputs = await repo.loadPendingInputs(
      db,
      this.engine.id,
      this.engine.processedInputNumber,
      this.maxInputsPerStep,
    );

    const lastStepTs = this.engine.currentTime;
    const startTs = lastStepTs ? lastStepTs + this.tickDuration : now;
    let currentTs = startTs;
    let inputIndex = 0;
    let numTicks = 0;
    let processedInputNumber = this.engine.processedInputNumber;
    const completedInputs: EngineUpdate['completedInputs'] = [];

    this.beginStep(currentTs);

    while (numTicks < this.maxTicksPerStep) {
      numTicks += 1;
      const tickInputs: InputDoc[] = [];
      while (inputIndex < inputs.length) {
        const input = inputs[inputIndex];
        if (input.received > currentTs) break;
        inputIndex += 1;
        processedInputNumber = input.number;
        tickInputs.push(input);
      }
      for (const input of tickInputs) {
        try {
          const value = this.handleInput(currentTs, input.name, input.args);
          completedInputs.push({ inputId: input.id, returnValue: { kind: 'ok', value } });
        } catch (e: any) {
          console.error(`Input ${input.id} (${input.name}) failed: ${e.message}`);
          completedInputs.push({
            inputId: input.id,
            returnValue: { kind: 'error', message: e.message },
          });
        }
      }
      this.tick(currentTs);
      const candidateTs = currentTs + this.tickDuration;
      if (now < candidateTs) break;
      currentTs = candidateTs;
    }

    const expectedGenerationNumber = this.engine.generationNumber;
    this.engine.currentTime = currentTs;
    this.engine.lastStepTs = lastStepTs;
    this.engine.generationNumber += 1;
    this.engine.processedInputNumber = processedInputNumber;

    const { id: _id, ...engineNoId } = this.engine;
    const update: EngineUpdate = { engine: engineNoId, expectedGenerationNumber, completedInputs };
    const diff = this.takeDiff();
    return { update, diff };
  }
}

// Persistence helper: applies engine update + completes inputs in a single
// "transaction" (best-effort — Postgres doesn't expose multi-statement
// transactions through the REST client, so we run them sequentially. For
// stronger guarantees you could move this into a SQL function).
export async function applyEngineUpdate(db: DB, engineId: string, update: EngineUpdate) {
  await repo.replaceEngine(db, engineId, update.engine);
  for (const c of update.completedInputs) {
    await repo.completeInput(db, c.inputId, c.returnValue);
  }
}
