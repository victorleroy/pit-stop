import {Alert, Button, Card, Stack, TextField, Typography} from '@/ui';
import {useState} from 'react';
import {Navigate, useNavigate, useParams} from 'react-router-dom';
import {setupInstance} from '@/api/auth';
import {Logo} from '@/components/Logo';
import {useAuth} from '@/contexts/AuthContext';
import {BOARD_BACKGROUND} from '@/theme/texture';

const PILL = {'& .MuiOutlinedInput-root': {borderRadius: 999, minHeight: 40}};

/**
 * First boot of an empty instance. The link comes from the service logs, which is what proves
 * the person filling this in operates the instance.
 */
export const SetupPage = () => {
  const {token = ''} = useParams();
  const navigate = useNavigate();
  const {login} = useAuth();
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const submit = () => {
    setError(undefined);
    setIsPending(true);

    setupInstance({email, name, orgName, password, token})
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

  const canSubmit = Boolean(orgName && name && email && password.length >= 12);

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
              Name your organisation and create its first administrator. This link works once.
            </Typography>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Stack spacing={1.5}>
            <TextField
              fullWidth
              onChange={(event) => setOrgName(event.target.value)}
              placeholder="Organisation name"
              sx={PILL}
              value={orgName}
            />
            <TextField
              fullWidth
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              sx={PILL}
              value={name}
            />
            <TextField
              autoComplete="email"
              fullWidth
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              sx={PILL}
              type="email"
              value={email}
            />
            <TextField
              autoComplete="new-password"
              fullWidth
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) submit();
              }}
              placeholder="At least 12 characters"
              sx={PILL}
              type="password"
              value={password}
            />
          </Stack>

          <Button
            disabled={!canSubmit || isPending}
            fullWidth
            onClick={submit}
            sx={{height: 40}}
            variant="contained"
          >
            Create the organisation
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
};
