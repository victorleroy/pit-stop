// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppLayout} from '@/components/AppLayout';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: {email: 'ada@example.com', id: 'u1', name: 'Ada Lovelace', orgId: 'o1'},
  }),
}));

describe('AppLayout', () => {
  afterEach(cleanup);

  it('links the avatar of the header to the profile, without the name', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', {name: 'My profile'});

    expect(link.getAttribute('href')).toBe('/profile');
    expect(link.textContent).toContain('AL');
    expect(link.textContent).not.toContain('Ada Lovelace');
  });

  it('shows the full name in a tooltip on the header avatar', async () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    fireEvent.mouseOver(screen.getByRole('link', {name: 'My profile'}));

    expect((await screen.findByRole('tooltip')).textContent).toBe('Ada Lovelace');
  });
});
