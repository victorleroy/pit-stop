import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import {Alert, Box, Button, Container, Loader, Stack, TextField, Typography} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {ChangeEvent} from 'react';
import {useRef, useState} from 'react';
import {deleteAvatar, fetchMe, updateProfile, uploadAvatar} from '@/api/auth';
import {ApiError} from '@/api/client';
import type {User} from '@/api/types';
import {AvatarCropDialog} from '@/components/AvatarCropDialog';
import {UserAvatar} from '@/components/UserAvatar';
import {useAuth} from '@/contexts/AuthContext';
import {SURFACE} from '@/theme/texture';

const NAME_MAX = 80;
const IMAGE_TYPES = ['image/gif', 'image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const TOO_LARGE = 'This image is too large';
const UNSUPPORTED = 'This format is not supported';

const FAILURES: Record<number, string> = {
  409: 'No Google name known yet: sign in with Google again',
  413: TOO_LARGE,
  415: UNSUPPORTED,
  429: 'Too many uploads, try again in an hour',
};

// Same rule as the service: trim, then one space between words.
const normalise = (name: string) => name.trim().replace(/\s+/g, ' ');

export const ProfilePage = () => {
  const {replaceUser} = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSaved, setIsSaved] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const {data: profile, isError, isLoading} = useQuery({
    queryFn: fetchMe,
    queryKey: ['me', 'profile'],
  });

  const write = useMutation({
    mutationFn: (send: () => Promise<User>) => send(),
    onError: (cause: Error) => {
      setIsSaved(false);
      setError(cause instanceof ApiError ? (FAILURES[cause.status] ?? cause.message) : cause.message);
    },
    onSettled: () => setIsUploading(false),
    onSuccess: (user) => {
      // Not `queryClient.clear()`: it is the same person, only the names and photos around
      // the app are stale.
      replaceUser(user);
      queryClient.setQueryData(['me', 'profile'], user);
      void queryClient.invalidateQueries({queryKey: ['teams']});
      void queryClient.invalidateQueries({queryKey: ['org']});
      void queryClient.invalidateQueries({queryKey: ['me', 'retros']});
      setDraft(undefined);
      setError(undefined);
      setIsSaved(true);
    },
  });

  const run = (send: () => Promise<User>) => {
    setError(undefined);
    setIsSaved(false);
    write.mutate(send);
  };

  if (isLoading) {
    return (
      <Stack sx={{alignItems: 'center', py: 6}}>
        <Loader />
      </Stack>
    );
  }

  if (isError || !profile) {
    return (
      <Container maxWidth="sm">
        <Alert role="alert" severity="error">
          Your profile could not be loaded
        </Alert>
      </Container>
    );
  }

  const name = draft ?? profile.name;
  const normalised = normalise(name);
  const length = [...normalised].length;
  const isNameValid = length >= 1 && length <= NAME_MAX;
  const hasUpload = profile.avatarSource === 'upload';
  // Without a Google photo, the automatic source shows the initials.
  const avatarValue =
    profile.avatarSource === 'auto' && !profile.ssoPictureUrl ? 'initials' : profile.avatarSource;

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];

    event.target.value = '';

    if (!chosen) return;

    if (!IMAGE_TYPES.includes(chosen.type)) {
      setError(UNSUPPORTED);
    } else if (chosen.size > IMAGE_MAX_BYTES) {
      setError(TOO_LARGE);
    } else {
      setError(undefined);
      setFile(chosen);
    }
  };

  const onAvatarChange = (value: string) => {
    if (value === 'upload') {
      if (!hasUpload) fileInput.current?.click();

      return;
    }

    run(() => updateProfile({avatar: {source: value === 'auto' ? 'auto' : 'initials'}}));
  };

  return (
    <Container maxWidth="sm">
      <Stack spacing={3}>
        <Typography component="h1" variant="headingL">
          My profile
        </Typography>

        <Stack spacing={3} sx={{...SURFACE, p: 3}}>
          <Stack direction="row" spacing={2} sx={{alignItems: 'center'}}>
            <UserAvatar
              decorative
              id={profile.id}
              name={profile.name}
              pictureUrl={profile.pictureUrl}
              size="large"
              sx={{fontSize: 38, height: 96, width: 96}}
            />
            <Typography sx={{overflowWrap: 'anywhere'}} variant="headingS">
              {profile.name}
            </Typography>
          </Stack>

          {error ? (
            <Alert onClose={() => setError(undefined)} role="alert" severity="error">
              {error}
            </Alert>
          ) : null}

          <Stack
            component="form"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => updateProfile({name: normalised}));
            }}
            spacing={1}
          >
            <TextField
              error={length > NAME_MAX}
              fullWidth
              helperText={`${length}/${NAME_MAX}`}
              label="Display name"
              onChange={(event) => setDraft(event.target.value)}
              required
              value={name}
            />
            <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexWrap: 'wrap'}} useFlexGap>
              <Button
                disabled={!isNameValid || normalised === profile.name || write.isPending}
                type="submit"
                variant="contained"
              >
                Save
              </Button>
              {profile.hasSsoName && profile.nameSource === 'user' ? (
                <Button
                  disabled={write.isPending}
                  onClick={() => run(() => updateProfile({useSsoName: true}))}
                  variant="text"
                >
                  Use my Google name
                </Button>
              ) : null}
            </Stack>
          </Stack>

          <FormControl>
            <FormLabel id="avatar-source">Avatar</FormLabel>
            <RadioGroup
              aria-labelledby="avatar-source"
              onChange={(_event, value) => onAvatarChange(value)}
              value={avatarValue}
            >
              {profile.ssoPictureUrl ? (
                <FormControlLabel
                  control={<Radio />}
                  disabled={write.isPending}
                  label={
                    <Stack direction="row" spacing={1.5} sx={{alignItems: 'center'}}>
                      <Box aria-hidden sx={{display: 'flex'}}>
                        <UserAvatar
                          decorative
                          id={profile.id}
                          name={profile.name}
                          pictureUrl={profile.ssoPictureUrl}
                          size="small"
                        />
                      </Box>
                      <span>Google photo</span>
                    </Stack>
                  }
                  value="auto"
                />
              ) : null}

              <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexWrap: 'wrap'}} useFlexGap>
                <FormControlLabel
                  control={<Radio />}
                  disabled={write.isPending}
                  label="My photo"
                  value="upload"
                />
                <Button
                  disabled={write.isPending}
                  loading={isUploading}
                  onClick={() => fileInput.current?.click()}
                  size="small"
                  variant="outlined"
                >
                  Upload…
                </Button>
                {hasUpload ? (
                  <Button
                    disabled={write.isPending}
                    onClick={() => run(deleteAvatar)}
                    size="small"
                    variant="text"
                  >
                    Remove
                  </Button>
                ) : null}
              </Stack>

              <FormControlLabel
                control={<Radio />}
                disabled={write.isPending}
                label={
                  <Stack direction="row" spacing={1.5} sx={{alignItems: 'center'}}>
                    <Box aria-hidden sx={{display: 'flex'}}>
                      <UserAvatar decorative id={profile.id} name={profile.name} size="small" />
                    </Box>
                    <span>Initials</span>
                  </Stack>
                }
                value="initials"
              />
            </RadioGroup>

            <input
              accept="image/*"
              aria-label="Choose a photo"
              data-testid="avatar-file"
              hidden
              onChange={onFileChosen}
              ref={fileInput}
              type="file"
            />
          </FormControl>

          <Typography color="textSecondary" variant="textXs">
            Your name and avatar are visible to everyone in your organisation.
          </Typography>

          <Typography aria-live="polite" color="textSecondary" role="status" variant="textXs">
            {isSaved ? 'Profile saved' : ''}
          </Typography>
        </Stack>
      </Stack>

      {file ? (
        <AvatarCropDialog
          file={file}
          onCancel={() => setFile(undefined)}
          onConfirm={(image) => {
            setFile(undefined);
            setIsUploading(true);
            run(() => uploadAvatar(image));
          }}
        />
      ) : null}
    </Container>
  );
};
