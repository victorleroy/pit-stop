import {Alert, Button, Card, Stack, TextField, Typography} from '@/ui';
import {useState} from 'react';
import {Link, Navigate, useNavigate, useParams} from 'react-router-dom';
import {verifyEmail} from '@/api/auth';
import {Logo} from '@/components/Logo';
import {useAuth} from '@/contexts/AuthContext';
import {BOARD_BACKGROUND} from '@/theme/texture';

const PILL = {'& .MuiOutlinedInput-root': {borderRadius: 999, minHeight: 40}};

/**
 * Opening the link sent at registration proves the address, and the password is chosen
 * here: it belongs to whoever holds the mailbox, never to whoever typed the address.
 */
export const VerifyEmailPage = () => {
  const {token = ''} = useParams();
  const navigate = useNavigate();
  const {login} = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const submit = () => {
    setError(undefined);
    setIsPending(true);

    verifyEmail(token, password)
      .then((response) => {
        login(response);
        navigate('/teams', {replace: true});
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setIsPending(false));
  };

  if (!token) {
    return <Navigate replace to="/login" />;
  }

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
              Your address is confirmed once you choose a password for your account.
            </Typography>
          </Stack>

          {error ? (
            <>
              <Alert severity="error">{error}</Alert>
              <Typography sx={{textAlign: 'center'}} variant="textS">
                <Link to="/login">Back to sign in</Link>
              </Typography>
            </>
          ) : null}

          <TextField
            autoComplete="new-password"
            fullWidth
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && password) submit();
            }}
            placeholder="At least 12 characters"
            sx={PILL}
            type="password"
            value={password}
          />

          <Button
            disabled={!password || isPending}
            fullWidth
            onClick={submit}
            sx={{height: 40}}
            variant="contained"
          >
            Confirm and open my account
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
};
