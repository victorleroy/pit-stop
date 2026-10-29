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
import {Link, NavLink, Outlet, useMatch} from 'react-router-dom';
import {Logo} from '@/components/Logo';
import {useAuth} from '@/contexts/AuthContext';
import {BOARD_BACKGROUND} from '@/theme/texture';
import {initials} from '@/utils/initials';

const NAV_ITEMS = [
  {label: 'My retros', to: '/retros'},
  {label: 'Teams', to: '/teams'},
];

export const AppLayout = () => {
  const {logout, user} = useAuth();
  const isBoard = Boolean(useMatch('/teams/:teamId/retros/:retroId'));

  // Administration is the customer's own screen and belongs with the product navigation.
  // The paddock is the operator's, for one or two addresses named in the deploy config: it
  // sits on the far right, next to the account, so it never reads as part of the product.
  const items = [
    ...NAV_ITEMS,
    ...(user?.isOrgAdmin ? [{label: 'Administration', to: '/admin'}] : []),
  ];

  return (
    // A column as tall as the window at least, so a short page still fills a large screen.
    <Box sx={{...BOARD_BACKGROUND, display: 'flex', flexDirection: 'column', minHeight: '100vh'}}>
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
          <Stack
            direction="row"
            spacing={{xs: 1.5, sm: 3}}
            // On a phone the links scroll sideways rather than spill over the account.
            sx={{
              alignItems: 'center',
              flexGrow: 1,
              minWidth: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              whiteSpace: 'nowrap',
            }}
          >
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

          <Stack direction="row" spacing={{xs: 1, sm: 2}} sx={{alignItems: 'center', flexShrink: 0, ml: 2}}>
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
            {/* On a phone the avatar alone says who is signed in. */}
            <Typography sx={{display: {xs: 'none', md: 'block'}}} variant="textS">
              {user?.name}
            </Typography>
            <Button onClick={logout} size="small" variant="text">
              Sign out
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* A board takes the whole width: every column more that fits is one less to scroll to.
          Its columns start on the left like any document, and the toolbar spans above them.
          The other pages keep a reading width. */}
      <Container maxWidth={isBoard ? false : 'xl'} sx={{flexGrow: 1, py: 4}}>
        <Outlet />
      </Container>

    </Box>
  );
};
