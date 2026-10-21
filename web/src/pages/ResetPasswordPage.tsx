import {Alert, Button, Card, Stack, TextField, Typography} from '@/ui';
import {useState} from 'react';
import {Navigate, useNavigate, useParams} from 'react-router-dom';
import {confirmPasswordReset} from '@/api/auth';
import {Logo} from '@/components/Logo';
import {BOARD_BACKGROUND} from '@/theme/texture';

const PILL = {'& .MuiOutlinedInput-root': {borderRadius: 999, minHeight: 40}};

/** Choosing a new password cuts every existing session, which is the point. */
export const ResetPasswordPage = () => {
  const {token = ''} = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const submit = () => {
    setError(undefined);
    setIsPending(true);

    confirmPasswordReset(token, password)
      .then(() => navigate('/login', {replace: true}))
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
              Choose a new password. Everywhere you are signed in will be signed out.
            </Typography>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

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
            Save the new password
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
};
