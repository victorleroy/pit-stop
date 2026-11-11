// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {ToastProvider, useToast} from '@/contexts/ToastContext';

let toast: ReturnType<typeof useToast>;

const Probe = () => {
  toast = useToast();
  return null;
};

describe('ToastProvider', () => {
  afterEach(cleanup);

  it('closes the podium on Escape but keeps an error the user has not read', () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    act(() => {
      toast.error('Saving failed');
      toast.info('Pit stop record: 2 stops');
    });

    fireEvent.keyDown(window, {key: 'Escape'});

    expect(screen.queryByText('Pit stop record: 2 stops')).toBeNull();
    expect(screen.getByText('Saving failed')).toBeTruthy();
  });
});
