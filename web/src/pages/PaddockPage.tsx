import {
  Alert,
  Button,
  Card,
  Container,
  Loader,
  Stack,
  Tag,
  TextField,
  Typography,
} from '@/ui';
import MenuItem from '@mui/material/MenuItem';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {Navigate} from 'react-router-dom';
import {fetchPublicConfig} from '@/api/auth';
import {
  createOrganization,
  fetchOrganizations,
  setDomainVerified,
  setOrgStatus,
} from '@/api/platform';
import type {OrgStatus, OrgSummary} from '@/api/types';
import {useAuth} from '@/contexts/AuthContext';
import {useToast} from '@/contexts/ToastContext';
import {SURFACE} from '@/theme/texture';

const STATUS_COLOUR: Record<OrgStatus, string> = {
  active: '#0F9D58',
  demo: '#C98A21',
  suspended: '#D64545',
};

const relative = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : 'never');

/**
 * The paddock.
 *
 * It shows organisations, counters and status, and nothing else: there is no board content
 * here, no note, no vote, no author, and no way to sign in as somebody. That is a deliberate
 * limit, not a missing feature. An operator who can read a retro's stickies destroys the
 * promise the product is built on.
 */
export const PaddockPage = () => {
  const {user} = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [domain, setDomain] = useState('');

  const {data: config} = useQuery({queryKey: ['config'], queryFn: fetchPublicConfig});
  const {data: organizations, isLoading} = useQuery({
    enabled: Boolean(user?.isPlatformAdmin),
    queryFn: fetchOrganizations,
    queryKey: ['paddock', 'organizations'],
  });

  const refresh = () =>
    queryClient.invalidateQueries({queryKey: ['paddock', 'organizations']});

  const create = useMutation({
    mutationFn: () => createOrganization(name, adminEmail, domain || undefined),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: () => {
      toast.success(
        config?.mailEnabled
          ? `${name} created, its first administrator has been invited.`
          : `${name} created. The invitation link of its first administrator is in the service logs.`,
      );
      setName('');
      setAdminEmail('');
      setDomain('');
      void refresh();
    },
  });

  const changeStatus = useMutation({
    mutationFn: ({orgId, status}: {orgId: string; status: OrgStatus}) =>
      setOrgStatus(orgId, status),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: () => void refresh(),
  });

  const verify = useMutation({
    mutationFn: ({domain: value, orgId, verified}: {domain: string; orgId: string; verified: boolean}) =>
      setDomainVerified(orgId, value, verified),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: () => void refresh(),
  });

  if (user && !user.isPlatformAdmin) {
    return <Navigate replace to="/teams" />;
  }

  return (
    <Container maxWidth="lg" sx={{py: 4}}>
      <Stack spacing={3}>
        <Stack spacing={0.5}>
          <Typography variant="headingL">Paddock</Typography>
          <Typography color="textSecondary" variant="textS">
            Organisations, their tier and their verified domains. Board content is never
            reachable from here.
          </Typography>
        </Stack>

        <Card sx={{...SURFACE, p: 3}}>
          <Stack spacing={2}>
            <Typography variant="headingS">New organisation</Typography>
            <Stack direction={{sm: 'row', xs: 'column'}} spacing={1.5}>
              <TextField
                fullWidth
                label="Name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              <TextField
                fullWidth
                label="First administrator email"
                onChange={(event) => setAdminEmail(event.target.value)}
                type="email"
                value={adminEmail}
              />
              <TextField
                fullWidth
                label="Email domain (optional)"
                onChange={(event) => setDomain(event.target.value)}
                value={domain}
              />
              <Button
                disabled={!name || !adminEmail || create.isPending}
                onClick={() => create.mutate()}
                sx={{flexShrink: 0}}
                variant="contained"
              >
                Create and invite
              </Button>
            </Stack>
            <Typography color="textSecondary" variant="textXs">
              The organisation starts on the demo tier with no member. Its first administrator
              receives an invitation and joins by accepting it.
            </Typography>
          </Stack>
        </Card>

        {isLoading ? (
          <Stack sx={{alignItems: 'center', py: 6}}>
            <Loader />
          </Stack>
        ) : null}

        {organizations?.length === 0 ? (
          <Alert severity="info">No organisation yet. Create the first one above.</Alert>
        ) : null}

        <Stack spacing={2}>
          {organizations?.map((org: OrgSummary) => (
            <Card key={org.id} sx={{...SURFACE, p: 3}}>
              <Stack spacing={2}>
                <Stack
                  direction={{sm: 'row', xs: 'column'}}
                  spacing={2}
                  sx={{alignItems: {sm: 'center'}, justifyContent: 'space-between'}}
                >
                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                      <Typography variant="headingS">{org.name}</Typography>
                      <Tag colour={STATUS_COLOUR[org.status]}>{org.status}</Tag>
                    </Stack>
                    <Typography color="textSecondary" variant="textXs">
                      {org.memberCount} members · {org.teamCount} teams · {org.retroCount} retros
                      · last retro {relative(org.lastActivityAt)}
                    </Typography>
                  </Stack>

                  <TextField
                    label="Tier"
                    onChange={(event) =>
                      changeStatus.mutate({
                        orgId: org.id,
                        status: event.target.value as OrgStatus,
                      })
                    }
                    select
                    size="small"
                    sx={{minWidth: 160}}
                    value={org.status}
                  >
                    {(['demo', 'active', 'suspended'] as const).map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack spacing={1}>
                  <Typography color="textSecondary" variant="textXs">
                    Verified domains let colleagues join on their own, with no invitation email.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{flexWrap: 'wrap', gap: 1}}>
                    {org.domains.length === 0 ? (
                      <Typography color="textSecondary" variant="textXs">
                        No domain
                      </Typography>
                    ) : null}
                    {org.domains.map((entry) => (
                      <Button
                        key={entry.domain}
                        onClick={() =>
                          verify.mutate({
                            domain: entry.domain,
                            orgId: org.id,
                            verified: !entry.verified,
                          })
                        }
                        size="small"
                        variant={entry.verified ? 'contained' : 'outlined'}
                      >
                        {entry.domain} {entry.verified ? '· verified' : '· verify'}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
};
