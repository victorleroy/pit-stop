// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {UserAvatar} from '@/components/UserAvatar';
import {userColour} from '@/utils/userColour';

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));

  return `rgb(${r}, ${g}, ${b})`;
};

describe('UserAvatar', () => {
  afterEach(cleanup);

  it('falls back to the initials on the colour of the person', () => {
    const {container} = render(<UserAvatar name="Ada Lovelace" userId="u1" />);
    const avatar = container.firstElementChild as HTMLElement;

    expect(avatar.textContent).toBe('AL');
    expect(getComputedStyle(avatar).backgroundColor).toBe(rgb(userColour('u1')));
    expect(getComputedStyle(avatar).color).toBe('rgb(255, 255, 255)');
  });

  it('shows the photo when there is one', () => {
    const {container} = render(
      <UserAvatar name="Ada Lovelace" pictureUrl="/api/avatars/av_1" userId="u1" />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/avatars/av_1');
  });

  it('names the person for a screen reader when the avatar stands alone', () => {
    const {container} = render(<UserAvatar name="Ada" pictureUrl="/p.png" userId="u1" />);

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Ada');
  });

  it('stays silent when the name is written next to it', () => {
    const {container} = render(<UserAvatar decorative name="Ada" pictureUrl="/p.png" userId="u1" />);

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('takes an author as it comes, with an id', () => {
    const author = {id: 'u2', name: 'Grace Hopper', pictureUrl: undefined};
    const {container} = render(<UserAvatar {...author} />);

    expect(getComputedStyle(container.firstElementChild as HTMLElement).backgroundColor).toBe(
      rgb(userColour('u2')),
    );
  });

  it('takes a participant as it comes, with a userId', () => {
    const participant = {name: 'Grace Hopper', userId: 'u2'};
    const {container} = render(<UserAvatar {...participant} />);

    expect(getComputedStyle(container.firstElementChild as HTMLElement).backgroundColor).toBe(
      rgb(userColour('u2')),
    );
  });
});
