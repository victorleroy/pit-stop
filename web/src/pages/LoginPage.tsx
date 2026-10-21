import {Alert, Button, Card, Stack, TextField, Typography} from '@/ui';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Navigate} from 'react-router-dom';
import {
  fetchPublicConfig,
  loginAsDev,
  loginWithGoogle,
  loginWithPassword,
  register,
  requestPasswordReset,
} from '@/api/auth';
import {Logo} from '@/components/Logo';
import {SourceLink} from '@/components/SourceLink';
import {useAuth} from '@/contexts/AuthContext';
import {useGoogleSignIn} from '@/hooks/useGoogleSignIn';
import {BOARD_BACKGROUND, PAPER_SHADOW, noteColours} from '@/theme/texture';

/** The Google button renders itself at 40px; the rest of the stack lines up on it. */
const BUTTON_HEIGHT = 40;

/** A few notes pinned behind the card: the product explains itself before the first click. */
const DECOR_NOTES = [
  {columnIndex: 0, left: '6%', text: 'The CI is too slow', top: '18%'},
  {columnIndex: 2, left: '72%', text: 'Great pairing this sprint', top: '26%'},
  {columnIndex: 3, left: '12%', text: 'Ship the new onboarding', top: '68%'},
  {columnIndex: 1, left: '76%', text: 'Too many meetings', top: '62%'},
];

type Mode = 'signin' | 'register' | 'reset';

const PILL = {
  '& .MuiOutlinedInput-root': {borderRadius: 999, minHeight: BUTTON_HEIGHT},
};

export const LoginPage = () => {
  const {login, user} = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const {data: config} = useQuery({queryKey: ['config'], queryFn: fetchPublicConfig});

  const run = (work: Promise<unknown>, onDone?: () => void) => {
    setError(undefined);
    setNotice(undefined);
    setIsPending(true);
    work
      .then(() => onDone?.())
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setIsPending(false));
  };

  const buttonRef = useGoogleSignIn((idToken) => {
    run(loginWithGoogle(idToken).then(login));
  }, config?.googleClientId);

  const submit = () => {
    if (mode === 'signin') {
      run(loginWithPassword(email, password).then(login));
      return;
    }

    if (mode === 'register') {
      run(register(email, name), () => {
        setNotice(
          config?.mailEnabled
            ? 'Almost there: open the link we sent to that address to choose your password.'
            : 'Almost there: the confirmation link is in the service logs, ask whoever operates this instance.',
        );
        setMode('signin');
      });
      return;
    }

    run(requestPasswordReset(email), () =>
      setNotice('If that address has an account, a reset link is on its way.'),
    );
  };

  if (user) {
    return <Navigate replace to="/teams" />;
  }

  const canSubmit =
    mode === 'reset'
      ? Boolean(email)
      : mode === 'register'
        ? Boolean(email && name)
        : Boolean(email && password);

  return (
    <Stack
      sx={{
        ...BOARD_BACKGROUND,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 2,
        position: 'relative',
      }}
    >
      {DECOR_NOTES.map((note) => (
        <Stack
          key={note.text}
          sx={{
            bgcolor: noteColours(note.columnIndex).paper,
            borderRadius: 0,
            boxShadow: PAPER_SHADOW,
            color: noteColours(note.columnIndex).ink,
            display: {md: 'flex', xs: 'none'},
            left: note.left,
            maxWidth: 170,
            p: 2,
            position: 'absolute',
            top: note.top,
          }}
        >
          <Typography sx={{color: 'inherit'}} variant="textS">
            {note.text}
          </Typography>
        </Stack>
      ))}

      <Card sx={{maxWidth: 400, p: 4, position: 'relative', width: '100%', zIndex: 1}}>
        <Stack spacing={3} sx={{alignItems: 'stretch'}}>
          <Stack spacing={1.5} sx={{alignItems: 'center', textAlign: 'center'}}>
            <Logo size="large" stacked />
            <Typography color="textSecondary" variant="textS">
              Team retrospectives, without the sticky note that falls off the wall.
            </Typography>
          </Stack>

          {config?.setupRequired ? (
            <Alert severity="info">
              This instance has no organisation yet. Open the setup link printed in the service
              logs to create the first administrator.
            </Alert>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? <Alert severity="success">{notice}</Alert> : null}

          {/* Google sign-in is optional on a self-hosted instance (ADR-002 D5). */}
          {config?.googleClientId ? (
            <>
              {/* Full width so Google has the same room to fill as the fields below. */}
              <div ref={buttonRef} style={{width: '100%'}} />

              <Divider>
                <Typography color="textSecondary" variant="textXs">
                  or with an email
                </Typography>
              </Divider>
            </>
          ) : null}

          <Stack spacing={1.5}>
            {mode === 'register' ? (
              <TextField
                fullWidth
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                sx={PILL}
                value={name}
              />
            ) : null}

            <TextField
              autoComplete="email"
              fullWidth
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              sx={PILL}
              type="email"
              value={email}
            />

            {/* Registering asks no password: it is chosen on the confirmation link. */}
            {mode === 'signin' ? (
              <TextField
                autoComplete="current-password"
                fullWidth
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSubmit) submit();
                }}
                placeholder="Password"
                sx={PILL}
                type="password"
                value={password}
              />
            ) : null}

            <Button
              disabled={!canSubmit || isPending}
              fullWidth
              onClick={submit}
              sx={{height: BUTTON_HEIGHT}}
              variant="contained"
            >
              {mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send link'}
            </Button>

            <Stack
              direction="row"
              spacing={2}
              sx={{justifyContent: 'center', flexWrap: 'wrap'}}
            >
              {mode === 'signin' ? (
                <>
                  <Link component="button" onClick={() => setMode('register')} variant="textXs">
                    Create an account
                  </Link>
                  <Link component="button" onClick={() => setMode('reset')} variant="textXs">
                    Forgot password
                  </Link>
                </>
              ) : (
                <Link component="button" onClick={() => setMode('signin')} variant="textXs">
                  Back to sign in
                </Link>
              )}
            </Stack>

            {mode === 'register' ? (
              <Typography color="textSecondary" sx={{textAlign: 'center'}} variant="textXs">
                Accounts are created by invitation, or with an email address whose domain your
                organisation has verified.
              </Typography>
            ) : null}
          </Stack>

          {config?.devLoginEnabled ? (
            <>
              <Divider>
                <Typography color="textSecondary" variant="textXs">
                  development only
                </Typography>
              </Divider>

              <Stack spacing={1.5}>
                <TextField
                  fullWidth
                  onChange={(event) => setDevEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && devEmail) {
                      run(loginAsDev(devEmail).then(login));
                    }
                  }}
                  placeholder="renault.fuego@acme.io"
                  sx={{
                    ...PILL,
                    '& .MuiOutlinedInput-input': {textAlign: 'center'},
                  }}
                  value={devEmail}
                />
                <Button
                  disabled={!devEmail || isPending}
                  fullWidth
                  onClick={() => run(loginAsDev(devEmail).then(login))}
                  sx={{height: BUTTON_HEIGHT}}
                  variant="outlined"
                >
                  Sign in without a password
                </Button>
                <Typography color="textSecondary" sx={{textAlign: 'center'}} variant="textXs">
                  Signs you in as this address, without a password, and bootstraps a local
                  organisation. Open a private window to be a second person at the same time.
                </Typography>
              </Stack>
            </>
          ) : null}
        </Stack>
      </Card>

      <Stack sx={{mt: 2, position: 'relative', zIndex: 1}}>
        <SourceLink />
      </Stack>
    </Stack>
  );
};
