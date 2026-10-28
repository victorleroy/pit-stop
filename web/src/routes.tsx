import {Loader, Stack} from '@/ui';
import {createBrowserRouter, Navigate, Outlet} from 'react-router-dom';
import {AppLayout} from '@/components/AppLayout';
import {useAuth} from '@/contexts/AuthContext';
import {AdminPage} from '@/pages/AdminPage';
import {PaddockPage} from '@/pages/PaddockPage';
import {InvitePage} from '@/pages/InvitePage';
import {LoginPage} from '@/pages/LoginPage';
import {MyRetrosPage} from '@/pages/MyRetrosPage';
import {ResetPasswordPage} from '@/pages/ResetPasswordPage';
import {SetupPage} from '@/pages/SetupPage';
import {RetroPage} from '@/pages/RetroPage';
import {TeamPage} from '@/pages/TeamPage';
import {TeamsPage} from '@/pages/TeamsPage';
import {VerifyEmailPage} from '@/pages/VerifyEmailPage';

/**
 * While the session is being restored a loader is shown rather than a redirect: refreshing
 * a page must not bounce somebody back to the login screen.
 */
const RequireAuth = () => {
  const {isLoading, user} = useAuth();

  if (isLoading) {
    return (
      <Stack sx={{alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <Loader />
      </Stack>
    );
  }

  return user ? <Outlet /> : <Navigate replace to="/login" />;
};

export const router = createBrowserRouter([
  {element: <LoginPage />, path: '/login'},
  {element: <InvitePage />, path: '/invite/:token'},
  {element: <ResetPasswordPage />, path: '/reset-password/:token'},
  {element: <SetupPage />, path: '/setup/:token'},
  {element: <VerifyEmailPage />, path: '/verify-email/:token'},
  {
    children: [
      {
        children: [
          // Your own retros are the home page: the first thing anybody wants back to.
          {element: <Navigate replace to="/retros" />, index: true},
          {element: <TeamsPage />, path: 'teams'},
          {element: <MyRetrosPage />, path: 'retros'},
          {element: <AdminPage />, path: 'admin'},
          {element: <PaddockPage />, path: 'paddock'},
          {element: <TeamPage />, path: 'teams/:teamId'},
          {element: <RetroPage />, path: 'teams/:teamId/retros/:retroId'},
          {element: <Navigate replace to="/retros" />, path: '*'},
        ],
        element: <AppLayout />,
        path: '/',
      },
    ],
    element: <RequireAuth />,
    path: '/',
  },
]);
