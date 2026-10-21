import {Alert, Button, Card, Stack, TextField, Typography} from '@/ui';
import {useState} from 'react';
import {Link, Navigate, useNavigate, useParams} from 'react-router-dom';
import {acceptInvitation} from '@/api/auth';
import {Logo} from '@/components/Logo';
import {useAuth} from '@/contexts/AuthContext';
import {BOARD_BACKGROUND} from '@/theme/texture';

const PILL = {'& .MuiOutlinedInput-root': {borderRadius: 999, minHeight: 40}};

/**
 * The only way into a new organisation besides a verified email domain.
 *
 * The invitation is bound to the address it was sent to, so there is no email field here:
 * the service resolves it from the token. Somebody who already has an account signs in
 * first, then accepts; a new account is created and signed in by the acceptance itself.
 */
export const InvitePage = () => {
  const {token = ''} = useParams();
  const navigate = useNavigate();
  const {login, refresh, user} = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const accept = () => {
    setError(undefined);
    setIsPending(true);

    acceptInvitation(token, user ? undefined : name, user ? undefined : password)
      .then(async (response) => {
        if (response) {
          login(response);
        } else {
          // The membership changed under the current session: refresh who we are.
          await refresh();
        }

        navigate('/teams', {replace: true});
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setIsPending(false));
  };

  if (!token) {
    return <Navigate replace to="/login" />;
  }

  const canSubmit = user ? true : Boolean(name && password.length >= 12);

  return (
    <Stack
      sx={{
        ...BOARD_BACKGROUND,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 2,
      }}
    >
      <Card sx={{maxWidth: 400, p: 4, width: '100%'}}>
        <Stack spacing={3}>
          <Stack spacing={1.5} sx={{alignItems: 'center', textAlign: 'center'}}>
            <Logo size="large" stacked />
            <Typography color="textSecondary" variant="textS">
              {user
                ? 'Accept this invitation to join the organisation.'
                : 'You were invited. Pick a name and a password to get started.'}
            </Typography>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {user ? null : (
            <Stack spacing={1.5}>
              <TextField
                fullWidth
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                sx={PILL}
                value={name}
              />
              <TextField
                autoComplete="new-password"
                fullWidth
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
                sx={PILL}
                type="password"
                value={password}
              />
            </Stack>
          )}

          <Button
            disabled={!canSubmit || isPending}
            fullWidth
            onClick={accept}
            sx={{height: 40}}
            variant="contained"
          >
            Accept the invitation
          </Button>

          {user ? null : (
            <Typography color="textSecondary" sx={{textAlign: 'center'}} variant="textXs">
              Already have an account? <Link to="/login">Sign in</Link>, then open the
              invitation link again.
            </Typography>
          )}
        </Stack>
      </Card>
    </Stack>
  );
};
