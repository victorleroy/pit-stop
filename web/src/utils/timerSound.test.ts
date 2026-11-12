// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';

describe('playWrenchClack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('plays the first clack once the gesture has resumed the audio context', async () => {
    const start = vi.fn();
    const node = () => ({connect: (next: unknown) => next});

    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      sampleRate = 1000;
      state = 'suspended';
      createBiquadFilter = () => ({...node(), Q: {}, frequency: {}});
      createBuffer = () => ({getChannelData: () => new Float32Array(60)});
      createBufferSource = () => ({...node(), start});
      createGain = () => ({...node(), gain: {exponentialRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn()}});
      resume = async () => {
        this.state = 'running';
      };
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);
    const {playWrenchClack} = await import('@/utils/timerSound');

    playWrenchClack();
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });
});
