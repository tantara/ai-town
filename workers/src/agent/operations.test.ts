import { operations } from './operations';

describe('agent operations registry', () => {
  it('exposes the three operations dispatched from the DO', () => {
    expect(Object.keys(operations).sort()).toEqual([
      'agentDoSomething',
      'agentGenerateMessage',
      'agentRememberConversation',
    ]);
  });

  it('every operation is a function', () => {
    for (const [name, op] of Object.entries(operations)) {
      expect(typeof op).toBe('function');
      expect(op.length).toBeGreaterThanOrEqual(2);
      expect(name.startsWith('agent')).toBe(true);
    }
  });
});
