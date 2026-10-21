import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from '@/ui';
import {Link, NavLink, Outlet} from 'react-router-dom';
import {Logo} from '@/components/Logo';
import {SourceLink} from '@/components/SourceLink';
import {useAuth} from '@/contexts/AuthContext';
import {BOARD_BACKGROUND} from '@/theme/texture';
import {initials} from '@/utils/initials';

const NAV_ITEMS = [
  {label: 'My retros', to: '/retros'},
  {label: 'Teams', to: '/teams'},
];

export const AppLayout = () => {
  const {logout, user} = useAuth();

  // Administration is the customer's own screen and belongs with the product navigation.
  // The paddock is the operator's, for one or two addresses named in the deploy config: it
  // sits on the far right, next to the account, so it never reads as part of the product.
  const items = [
    ...NAV_ITEMS,
    ...(user?.isOrgAdmin ? [{label: 'Administration', to: '/admin'}] : []),
  ];

  return (
    <Box sx={{...BOARD_BACKGROUND, minHeight: '100vh'}}>
      <AppBar
        color="default"
        elevation={0}
        position="static"
        sx={{
          backdropFilter: 'blur(12px)',
          bgcolor: 'rgba(255, 255, 255, 0.78)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar>
          <Stack direction="row" spacing={3} sx={{alignItems: 'center', flexGrow: 1}}>
            <Link style={{color: 'inherit', textDecoration: 'none'}} to="/retros">
              <Logo />
            </Link>

            {items.map((item) => (
              <NavLink key={item.to} style={{textDecoration: 'none'}} to={item.to}>
                {({isActive}) => (
                  <Typography
                    sx={{
                      color: isActive ? 'primary.main' : 'text.primary',
                      fontWeight: isActive ? 700 : 500,
                    }}
                    variant="textS"
                  >
                    {item.label}
                  </Typography>
                )}
              </NavLink>
            ))}
          </Stack>

          <Stack direction="row" spacing={2} sx={{alignItems: 'center'}}>
            {user?.isPlatformAdmin ? (
              <NavLink style={{textDecoration: 'none'}} to="/paddock">
                {({isActive}) => (
                  <Typography
                    sx={{
                      color: isActive ? 'primary.main' : 'text.secondary',
                      fontWeight: isActive ? 700 : 500,
                    }}
                    variant="textXs"
                  >
                    Paddock
                  </Typography>
                )}
              </NavLink>
            ) : null}

            <Avatar src={user?.pictureUrl}>{initials(user?.name)}</Avatar>
            <Typography variant="textS">{user?.name}</Typography>
            <Button onClick={logout} size="small" variant="text">
              Sign out
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{py: 4}}>
        <Outlet />
      </Container>

      <Box sx={{pb: 3}}>
        <SourceLink />
      </Box>
    </Box>
  );
};
