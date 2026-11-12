// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {InlineEditor} from '@/components/InlineEditor';

const setup = (multiline = false) => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(<InlineEditor multiline={multiline} onClose={onClose} onSave={onSave} value="old" />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, {target: {value: 'new'}});

  return {input, onClose, onSave};
};

describe('InlineEditor', () => {
  afterEach(cleanup);

  it('saves on Enter', () => {
    const {input, onClose, onSave} = setup();
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onSave).toHaveBeenCalledWith('new');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not save on Shift+Enter', () => {
    const {input, onSave} = setup(true);
    fireEvent.keyDown(input, {key: 'Enter', shiftKey: true});
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancels on Escape, even when the blur follows', () => {
    const {input, onClose, onSave} = setup();
    fireEvent.keyDown(input, {key: 'Escape'});
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves with the check button', () => {
    const {onSave} = setup();
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    expect(onSave).toHaveBeenCalledWith('new');
  });
});
