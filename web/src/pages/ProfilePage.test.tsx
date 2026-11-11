// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fetchMe, updateProfile, uploadAvatar} from '@/api/auth';
import {ApiError} from '@/api/client';
import type {User} from '@/api/types';
import {ProfilePage} from '@/pages/ProfilePage';

const replaceUser = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({useAuth: () => ({replaceUser})}));
vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  deleteAvatar: vi.fn(),
  fetchMe: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

const profile = (changes: Partial<User> = {}): User => ({
  avatarSource: 'auto',
  email: 'ada@example.com',
  hasSsoName: false,
  id: 'u1',
  name: 'Ada Lovelace',
  nameSource: 'user',
  orgId: 'o1',
  ...changes,
});

const renderPage = (user: User = profile()) => {
  vi.mocked(fetchMe).mockResolvedValue(user);
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});

  render(
    <QueryClientProvider client={client}>
      <ProfilePage />
    </QueryClientProvider>,
  );

  return client;
};

const save = () => screen.getByRole('button', {name: 'Save'}) as HTMLButtonElement;

const typeName = async (value: string) =>
  fireEvent.change(await screen.findByLabelText(/Display name/), {target: {value}});

// jsdom decodes and draws nothing: let the crop dialog believe it did.
const cropAndUpload = async () => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
    callback(new Blob(['x'], {type: type ?? ''})),
  );

  fireEvent.change(await screen.findByTestId('avatar-file'), {
    target: {files: [new File(['x'], 'me.png', {type: 'image/png'})]},
  });

  const image = document.querySelector('img[src="blob:photo"]') as HTMLImageElement;

  Object.defineProperty(image, 'naturalWidth', {configurable: true, value: 400});
  Object.defineProperty(image, 'naturalHeight', {configurable: true, value: 400});
  fireEvent.load(image);
  fireEvent.click(screen.getByRole('button', {name: 'Use this photo'}));
};

describe('ProfilePage', () => {
  beforeEach(() => replaceUser.mockClear());

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(updateProfile).mockReset();
    vi.mocked(uploadAvatar).mockReset();
  });

  it('keeps Save disabled until the name changes to something valid', async () => {
    renderPage();

    await typeName('Ada Lovelace');
    expect(save().disabled).toBe(true);

    await typeName('  Ada    Lovelace ');
    expect(save().disabled).toBe(true);

    await typeName('Ada B.');
    expect(save().disabled).toBe(false);

    await typeName('   ');
    expect(save().disabled).toBe(true);

    await typeName('x'.repeat(81));
    expect(save().disabled).toBe(true);
  });

  it('counts an emoji as one character, like the service', async () => {
    renderPage();

    await typeName('👩‍💻'.repeat(20));

    expect(screen.getByText('60/80')).toBeTruthy();
    expect(save().disabled).toBe(false);
  });

  it('counts the characters of the name', async () => {
    renderPage();

    await typeName('Ada');

    expect(screen.getByText('3/80')).toBeTruthy();
  });

  it('offers the Google photo only when there is one', async () => {
    renderPage();
    await screen.findByText('Initials');
    expect(screen.queryByRole('radio', {name: 'Google photo'})).toBeNull();

    cleanup();
    renderPage(profile({ssoPictureUrl: 'https://lh3.example/a.png'}));
    expect(await screen.findByRole('radio', {name: 'Google photo'})).toBeTruthy();
  });

  it('shows the initials as the source when nothing else can be shown', async () => {
    renderPage();

    expect(((await screen.findByRole('radio', {name: 'Initials'})) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it.each([
    [{hasSsoName: true, nameSource: 'user'}, true],
    [{hasSsoName: true, nameSource: 'sso'}, false],
    [{hasSsoName: false, nameSource: 'user'}, false],
  ] as const)('shows "Use my Google name" for %j: %s', async (changes, isShown) => {
    renderPage(profile({...changes}));
    await screen.findByLabelText(/Display name/);

    expect(Boolean(screen.queryByRole('button', {name: 'Use my Google name'}))).toBe(isShown);
  });

  it('offers to remove the photo only once one is uploaded', async () => {
    renderPage();
    await screen.findByLabelText(/Display name/);
    expect(screen.queryByRole('button', {name: 'Remove'})).toBeNull();

    cleanup();
    renderPage(profile({avatarSource: 'upload'}));
    expect(await screen.findByRole('button', {name: 'Remove'})).toBeTruthy();
  });

  it('replaces the signed-in user after a save, and never clears the cache', async () => {
    const saved = profile({name: 'Ada B.'});
    vi.mocked(updateProfile).mockResolvedValue(saved);
    const client = renderPage();
    const clear = vi.spyOn(client, 'clear');

    await typeName('Ada B.');
    fireEvent.click(save());

    await waitFor(() => expect(replaceUser).toHaveBeenCalledWith(saved));
    expect(updateProfile).toHaveBeenCalledWith({name: 'Ada B.'});
    expect(clear).not.toHaveBeenCalled();
    expect((await screen.findByRole('status')).textContent).toBe('Profile saved');
  });

  it('tells there is no Google name yet', async () => {
    vi.mocked(updateProfile).mockRejectedValue(new ApiError(409, 'conflict'));
    renderPage(profile({hasSsoName: true}));

    fireEvent.click(await screen.findByRole('button', {name: 'Use my Google name'}));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No Google name known yet: sign in with Google again',
    );
    expect(replaceUser).not.toHaveBeenCalled();
  });

  it.each([
    [413, 'This image is too large'],
    [415, 'This format is not supported'],
    [429, 'Too many uploads, try again in an hour'],
  ])('explains a %s on upload', async (status, message) => {
    vi.mocked(uploadAvatar).mockRejectedValue(new ApiError(status, 'raw'));
    renderPage();

    await cropAndUpload();

    expect((await screen.findByRole('alert')).textContent).toContain(message);
  });

  it('refuses a format or a size the service would not take, without sending', async () => {
    renderPage();
    const input = await screen.findByTestId('avatar-file');

    fireEvent.change(input, {target: {files: [new File(['x'], 'a.svg', {type: 'image/svg+xml'})]}});
    expect((await screen.findByRole('alert')).textContent).toContain('This format is not supported');

    const huge = new File(['x'], 'a.png', {type: 'image/png'});
    Object.defineProperty(huge, 'size', {value: 11 * 1024 * 1024});
    fireEvent.change(input, {target: {files: [huge]}});
    expect((await screen.findByRole('alert')).textContent).toContain('This image is too large');

    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', {name: 'Use this photo'})).toBeNull();
  });
});
