import CloseIcon from '@mui/icons-material/Close';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import {useTheme} from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  Box,
  Button,
  IconButton,
  Loader,
  Stack,
  Typography,
} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {PointerEvent as ReactPointerEvent, ReactNode} from 'react';
import {useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {
  addColumn,
  castVote,
  clearReviewOutcome,
  createAction,
  createNote,
  fetchActionStats,
  fetchBoard,
  groupNote,
  answerIcebreaker,
  hideMyNotes,
  removeColumn,
  removeIcebreakerAnswer,
  removeNote,
  renameCluster,
  resetDice,
  rollDie,
  takeFacilitation,
  reorderColumns,
  revealMyNotes,
  sendIcebreakerCommand,
  setNoteRevealed,
  setReviewFocus,
  recordReviewOutcome,
  ungroupNote,
  updateAction,
  updateColumn,
  updateNote,
  updateRetro,
} from '@/api/retros';
import {fetchTeamMembers, fetchTeams} from '@/api/teams';
import type {
  ActionStatus,
  Board,
  GameEvent,
  IcebreakerCommand,
  RetroPhase,
  ReviewOutcome,
  TimerAction,
} from '@/api/types';
import type {ConfirmRequest} from '@/components/ConfirmDialog';
import {ConfirmDialog} from '@/components/ConfirmDialog';
import {ActionList} from '@/components/ActionList';
import {ActionReview} from '@/components/ActionReview';
import {BoardColumn} from '@/components/BoardColumn';
import {CursorLayer} from '@/components/CursorLayer';
import {EmptyState} from '@/components/EmptyState';
import {IcebreakerPreview} from '@/components/icebreaker/IcebreakerPreview';
import {IcebreakerRecap} from '@/components/icebreaker/IcebreakerRecap';
import {IcebreakerStage} from '@/components/icebreaker/IcebreakerStage';
import {LobbyView} from '@/components/lobby/LobbyView';
import {WheelGun} from '@/components/lobby/WheelGun';
import {useAuth} from '@/contexts/AuthContext';
import {useToast} from '@/contexts/ToastContext';
import {BoardToolbar} from '@/components/BoardToolbar';
import {PresenceBar} from '@/components/PresenceBar';
import {RetroHeader} from '@/components/RetroHeader';
import {SpeakingOrder} from '@/components/SpeakingOrder';
import {useBoardSocket} from '@/hooks/useBoardSocket';
import {useDiceSpin} from '@/hooks/useDiceSpin';
import {podiumMessage, useLobbyGame} from '@/hooks/useLobbyGame';
import {SLIPSTREAM} from '@/ui/theme';
import {readZoom, saveZoom, stepZoom} from '@/utils/boardZoom';
import {boardAuthors} from '@/utils/authorFilter';
import {moveColumn} from '@/utils/columnOrder';
import {countOpenActions} from '@/utils/openActions';
import {COLUMN_EDIT_PHASES, REVIEW_OUTCOME_PHASES, nextOpeningPhase} from '@/utils/phases';

// Only used while the websocket is down.
const FALLBACK_POLL_INTERVAL_MS = 5_000;

const STATS_DEBOUNCE_MS = 500;

const FADE_WIDTH = 56;

const ACTIONS_WIDTH = 440;

// A mouse notch is about 100 and a trackpad pinch sends many small deltas: one step per notch.
const WHEEL_STEP = 50;

const fade = (side: 'left' | 'right', isShown: boolean) => ({
  backgroundImage: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${SLIPSTREAM.ground}, ${SLIPSTREAM.ground}00)`,
  // Clear of the scrollbar, which stays as plain to grab as ever.
  bottom: 16,
  opacity: isShown ? 1 : 0,
  pointerEvents: 'none',
  position: 'absolute',
  [side]: 0,
  top: 0,
  transition: 'opacity 160ms ease',
  width: FADE_WIDTH,
  zIndex: 3,
}) as const;

/**
 * The scrollbar of a wide board sits under its tallest column, often below the fold, so a
 * column out of sight would go unnoticed. The paper fades out on whichever side still has
 * more, the way a page does at the edge of a desk. The fades take no pointer: dragging,
 * cursors and the native wheel all go straight through to the board.
 */
const SideScroll = ({children}: {children: ReactNode}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({left: false, right: false});

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) return undefined;

    const update = () => {
      const {clientWidth, scrollLeft, scrollWidth} = scroller;
      const left = scrollLeft > 1;
      const right = scrollLeft + clientWidth < scrollWidth - 1;

      setEdges((current) =>
        current.left === left && current.right === right ? current : {left, right},
      );
    };

    update();
    scroller.addEventListener('scroll', update, {passive: true});
    window.addEventListener('resize', update);

    // A column added or removed changes the content's width without resizing the window.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(scroller);
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);

    return () => {
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  return (
    <Box sx={{position: 'relative'}}>
      <Box ref={scrollerRef} sx={{overflowX: 'auto', pb: 2}}>
        {children}
      </Box>
      <Box aria-hidden sx={fade('left', edges.left)} />
      <Box aria-hidden sx={fade('right', edges.right)} />
    </Box>
  );
};

export const RetroPage = () => {
  const {retroId} = useParams<{retroId: string}>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | undefined>(undefined);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  // Beside the board on a wide screen, so cards stay at hand; over it on a phone.
  const isWide = useMediaQuery(useTheme().breakpoints.up('md'));
  const [actionDraft, setActionDraft] = useState<{nonce: number; text: string} | undefined>(
    undefined,
  );
  // Per viewer: each screen picks its own, cursors stay fractions of the board whatever it is.
  const [zoom, setZoom] = useState(readZoom);
  const [authorFilter, setAuthorFilter] = useState<string[]>([]);
  const [lobbyTab, setLobbyTab] = useState<'setup' | 'waiting'>('waiting');
  const [boardElement, setBoardElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => saveZoom(zoom), [zoom]);

  // Ctrl+wheel (and a trackpad pinch) zooms the board instead of the whole page.
  useEffect(() => {
    if (!boardElement) return undefined;

    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;

      event.preventDefault();
      pending += event.deltaY;
      if (Math.abs(pending) < WHEEL_STEP) return;

      const direction = pending < 0 ? 1 : -1;
      pending = 0;
      setZoom((current) => stepZoom(current, direction));
    };

    boardElement.addEventListener('wheel', onWheel, {passive: false});
    return () => boardElement.removeEventListener('wheel', onWheel);
  }, [boardElement]);

  const queryKey = ['retros', retroId, 'board'];

  const toast = useToast();
  const {user} = useAuth();

  const onBoard = (next: Board) => queryClient.setQueryData(queryKey, next);

  const gameEventRef = useRef<(event: GameEvent) => void>(() => undefined);

  const {cursors, hideCursor, isConnected, isDiceSnapshot, isSubscribed, participants, rolls, send, sendCursor} =
    useBoardSocket({
      onBoard,
      onGameEvent: (event) => gameEventRef.current(event),
      retroId,
    });
  const dice = useDiceSpin(rolls, {
    isSnapshot: isDiceSnapshot,
    reducedMotion: useMediaQuery('(prefers-reduced-motion: reduce)'),
  });

  // While the socket is up it already carries the board this command produced, and possibly
  // a newer one: the HTTP response, arriving later, would only roll the board back.
  const boardMutationOptions = {
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: (next: Board) => {
      if (!isConnected) onBoard(next);
    },
  };

  const {data: board, dataUpdatedAt, error, isLoading} = useQuery({
    enabled: Boolean(retroId),
    queryFn: () => fetchBoard(retroId as string),
    queryKey,
    refetchInterval: isConnected ? false : FALLBACK_POLL_INTERVAL_MS,
  });

  // Held here, not in the lobby: the podium of a game ended by "Start the retro" must outlive
  // the lobby view it came from.
  const game = useLobbyGame({
    isActive: board?.phase === 'LOBBY' && !(board.isFacilitator && lobbyTab === 'setup'),
    isConnected: isSubscribed,
    onEnded: ({scores, teamStops}) => toast.info(podiumMessage(scores, teamStops)),
    send,
    userId: user?.id,
  });
  gameEventRef.current = game.handleEvent;

  const {data: members} = useQuery({
    enabled: Boolean(board?.teamId),
    queryFn: () => fetchTeamMembers(board?.teamId as string),
    queryKey: ['teams', board?.teamId, 'members'],
  });

  const {data: teams} = useQuery({
    enabled: board?.phase === 'LOBBY',
    queryFn: fetchTeams,
    queryKey: ['teams'],
  });

  const phaseMutation = useMutation({
    mutationFn: (phase: RetroPhase) => updateRetro(retroId as string, {phase}),
    ...boardMutationOptions,
  });
  const actionReviewMutation = useMutation({
    mutationFn: (actionReview: boolean) => updateRetro(retroId as string, {actionReview}),
    ...boardMutationOptions,
  });

  // Stats change with every outcome: read again once the clicks of a review settle down.
  const isReviewing = board?.phase === 'REVIEW';
  const statsKey = ['teams', board?.teamId, 'actions', 'stats', retroId];
  const {data: actionStats, refetch: refetchStats} = useQuery({
    enabled: isReviewing && Boolean(board?.teamId),
    queryFn: () => fetchActionStats(board?.teamId as string, retroId),
    queryKey: statsKey,
  });

  useEffect(() => {
    if (!isReviewing) return;

    const timeout = setTimeout(() => void refetchStats(), STATS_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [dataUpdatedAt, isReviewing, refetchStats]);
  const maxVotesMutation = useMutation({
    mutationFn: (maxVotes: number) => updateRetro(retroId as string, {maxVotes}),
    ...boardMutationOptions,
  });
  const takeFacilitationMutation = useMutation({
    mutationFn: () => takeFacilitation(retroId as string),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => queryClient.invalidateQueries({queryKey}),
  });
  const rollDieMutation = useMutation({
    mutationFn: () => rollDie(retroId as string),
    onError: (cause: Error) => {
      if (user) dice.stop(user.id);
      toast.error(cause.message);
    },
    onMutate: () => {
      if (user) dice.spin(user.id);
    },
  });
  const resetDiceMutation = useMutation({
    mutationFn: () => resetDice(retroId as string),
    onError: (cause: Error) => toast.error(cause.message),
  });
  const timerMutation = useMutation({
    mutationFn: ({action, seconds}: {action: TimerAction; seconds?: number}) =>
      updateRetro(retroId as string, {timer: {action, seconds}}),
    ...boardMutationOptions,
  });
  const icebreakerMutation = useMutation({
    mutationFn: (command: IcebreakerCommand) => sendIcebreakerCommand(retroId as string, command),
    ...boardMutationOptions,
  });
  const answerMutation = useMutation({
    mutationFn: (text: string) => answerIcebreaker(retroId as string, text),
    ...boardMutationOptions,
  });
  const removeAnswerMutation = useMutation({
    mutationFn: () => removeIcebreakerAnswer(retroId as string),
    ...boardMutationOptions,
  });
  const revealMutation = useMutation({
    mutationFn: () => revealMyNotes(retroId as string),
    ...boardMutationOptions,
  });
  const hideMutation = useMutation({
    mutationFn: () => hideMyNotes(retroId as string),
    ...boardMutationOptions,
  });
  const noteRevealMutation = useMutation({
    mutationFn: ({noteId, revealed}: {noteId: string; revealed: boolean}) =>
      setNoteRevealed(retroId as string, noteId, revealed),
    ...boardMutationOptions,
  });
  const addColumnMutation = useMutation({
    mutationFn: (title: string) => addColumn(retroId as string, title),
    ...boardMutationOptions,
  });
  const updateColumnMutation = useMutation({
    mutationFn: ({columnId, ...changes}: {columnId: string; prompt?: string | null; title?: string}) =>
      updateColumn(retroId as string, columnId, changes),
    ...boardMutationOptions,
  });
  const reorderColumnsMutation = useMutation({
    mutationFn: (columnIds: string[]) => reorderColumns(retroId as string, columnIds),
    ...boardMutationOptions,
  });
  const removeColumnMutation = useMutation({
    mutationFn: (columnId: string) => removeColumn(retroId as string, columnId),
    ...boardMutationOptions,
  });
  const createNoteMutation = useMutation({
    mutationFn: ({columnId, text}: {columnId: string; text: string}) =>
      createNote(retroId as string, columnId, text),
    ...boardMutationOptions,
  });
  const updateNoteMutation = useMutation({
    mutationFn: ({noteId, text}: {noteId: string; text: string}) =>
      updateNote(retroId as string, noteId, {text}),
    ...boardMutationOptions,
  });
  const moveNoteMutation = useMutation({
    mutationFn: ({columnId, noteId}: {columnId: string; noteId: string}) =>
      updateNote(retroId as string, noteId, {columnId}),
    ...boardMutationOptions,
  });
  const removeNoteMutation = useMutation({
    mutationFn: (noteId: string) => removeNote(retroId as string, noteId),
    ...boardMutationOptions,
  });
  const groupMutation = useMutation({
    mutationFn: ({noteId, targetId}: {noteId: string; targetId: string}) =>
      groupNote(retroId as string, noteId, targetId),
    ...boardMutationOptions,
  });
  const ungroupMutation = useMutation({
    mutationFn: (noteId: string) => ungroupNote(retroId as string, noteId),
    ...boardMutationOptions,
  });
  const renameClusterMutation = useMutation({
    mutationFn: ({clusterId, title}: {clusterId: string; title: string}) =>
      renameCluster(retroId as string, clusterId, title),
    ...boardMutationOptions,
  });
  const createActionMutation = useMutation({
    mutationFn: ({assigneeId, text}: {assigneeId?: string; text: string}) =>
      createAction(retroId as string, text, assigneeId),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey});
      void queryClient.invalidateQueries({queryKey: ['teams', board?.teamId, 'actions']});
    },
  });
  const updateActionMutation = useMutation({
    mutationFn: ({
      actionId,
      status,
      teamId,
      text,
    }: {
      actionId: string;
      status?: ActionStatus;
      teamId: string;
      text?: string;
    }) => updateAction(teamId, actionId, {status, text}),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: (_action, variables) => {
      void queryClient.invalidateQueries({queryKey});
      void queryClient.invalidateQueries({queryKey: ['teams', variables.teamId, 'actions']});
    },
  });
  // Closing a carried-over action from here records it as reviewed by this retro; reopening
  // it undoes that outcome.
  const reviewMutation = useMutation({
    mutationFn: async ({actionId, status}: {actionId: string; status: ActionStatus}) => {
      await (status === 'OPEN'
        ? clearReviewOutcome(retroId as string, actionId)
        : recordReviewOutcome(retroId as string, actionId, status));
    },
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey});
      void queryClient.invalidateQueries({queryKey: ['teams', board?.teamId, 'actions']});
    },
  });
  const outcomeMutation = useMutation({
    mutationFn: async ({
      actionId,
      comment,
      outcome,
    }: {
      actionId: string;
      comment?: string | null;
      outcome: ReviewOutcome | null;
    }) => {
      await (outcome === null
        ? clearReviewOutcome(retroId as string, actionId)
        : recordReviewOutcome(retroId as string, actionId, outcome, comment));
    },
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => {
      if (!isConnected) void queryClient.invalidateQueries({queryKey});
      void queryClient.invalidateQueries({queryKey: ['teams', board?.teamId, 'actions']});
    },
  });
  const focusMutation = useMutation({
    mutationFn: (actionId: string | null) => setReviewFocus(retroId as string, actionId),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => {
      if (!isConnected) void queryClient.invalidateQueries({queryKey});
    },
  });
  const voteMutation = useMutation({
    mutationFn: ({delta, targetId}: {delta: 1 | -1; targetId: string}) =>
      castVote(retroId as string, targetId, delta),
    ...boardMutationOptions,
  });

  const mutations = [
    phaseMutation,
    maxVotesMutation,
    timerMutation,
    icebreakerMutation,
    answerMutation,
    removeAnswerMutation,
    takeFacilitationMutation,
    revealMutation,
    hideMutation,
    noteRevealMutation,
    addColumnMutation,
    updateColumnMutation,
    reorderColumnsMutation,
    removeColumnMutation,
    createNoteMutation,
    updateNoteMutation,
    removeNoteMutation,
    groupMutation,
    moveNoteMutation,
    ungroupMutation,
    renameClusterMutation,
    voteMutation,
    createActionMutation,
    updateActionMutation,
    reviewMutation,
    outcomeMutation,
    actionReviewMutation,
  ];
  const isBusy = mutations.some(({isPending}) => isPending);

  if (isLoading) {
    return (
      <Stack sx={{alignItems: 'center', justifyContent: 'center', minHeight: 320}}>
        <Loader />
      </Stack>
    );
  }

  if (error || !board) {
    return (
      <EmptyState
        action={{label: 'Back to teams', onClick: () => navigate('/teams')}}
        message="It may have been deleted, or it belongs to a team you have not joined yet."
        title="This retro is out of reach"
        tone="error"
      />
    );
  }

  /**
   * Positions travel as fractions of the board box: the same note sits at the same spot on a
   * laptop and on a wide screen, where absolute pixels would land in the next column.
   */
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();

    if (board.phase === 'LOBBY' || !box.width || !box.height) return;

    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;

    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    sendCursor(x, y);
  };

  const isLobby = board.phase === 'LOBBY';
  const isSettingUp = isLobby && board.isFacilitator && lobbyTab === 'setup';
  const isRolling = board.phase === 'DISCUSS' && isConnected;
  const canEditColumns = COLUMN_EDIT_PHASES.includes(board.phase);
  const canWrite = board.phase === 'BRAINSTORM';
  const canModerate = ['BRAINSTORM', 'SHARE'].includes(board.phase);

  /**
   * The three most voted cards of the whole board, not of each column: what the team will
   * actually talk about does not care which heading a note sits under.
   */
  const ranks = new Map(
    board.columns
      .flatMap(({cards}) => cards)
      .filter(({totalVotes}) => (totalVotes ?? 0) > 0)
      .sort((left, right) => (right.totalVotes ?? 0) - (left.totalVotes ?? 0))
      .slice(0, 3)
      .map((card, index) => [card.id, index + 1] as const),
  );
  const canGroup = board.phase === 'SHARE';
  const canVote = board.phase === 'VOTE';
  const canDecide = board.phase === 'DISCUSS';
  const authors = boardAuthors(board);
  const activeAuthorFilter =
    authors.length > 1 ? authorFilter.filter((id) => authors.some((author) => author.id === id)) : [];
  const onStatusChange = (actionId: string, status: ActionStatus) =>
    updateActionMutation.mutate({actionId, status, teamId: board.teamId});
  const onTextChange = (actionId: string, text: string) =>
    updateActionMutation.mutate({actionId, teamId: board.teamId, text});
  const facilitatorName = members?.find(({userId}) => userId === board.facilitatorId)?.name;

  // Leaving the review is always possible; what nobody decided on stays open, said once.
  const changePhase = (phase: RetroPhase) => {
    const undecided = board.review.items.filter(({outcome}) => !outcome).length;

    if (board.phase !== 'REVIEW' || phase === 'REVIEW' || undecided === 0) {
      phaseMutation.mutate(phase);
      return;
    }

    setConfirmRequest({
      confirmLabel: 'Continue',
      confirmTone: 'primary',
      message: `${undecided} action${undecided === 1 ? ' has' : 's have'} not been reviewed. ${
        undecided === 1 ? 'It stays' : 'They stay'
      } open.`,
      onConfirm: () => phaseMutation.mutate(phase),
      title: 'Leave the review?',
    });
  };

  return (
    // The open panel takes the board's right edge, so the columns narrow instead of hiding under it.
    <Stack
      spacing={3}
      sx={{pr: isWide && isActionsOpen ? `${ACTIONS_WIDTH}px` : 0, transition: 'padding 225ms ease'}}
    >
      <ConfirmDialog onClose={() => setConfirmRequest(undefined)} request={confirmRequest} />

      <RetroHeader
        canZoom={board.columns.length > 0}
        icebreaker={
          board.icebreaker && !['LOBBY', 'ICEBREAKER'].includes(board.phase) ? (
            <IcebreakerRecap icebreaker={board.icebreaker} />
          ) : null
        }
        onZoomChange={setZoom}
        presence={
          <PresenceBar
            board={board}
            dice={
              isRolling
                ? {rolls: dice.settled, spinningIds: dice.spinningIds.filter((userId) => userId !== user?.id)}
                : undefined
            }
            isConnected={isConnected}
            participants={participants}
          />
        }
        teamId={board.teamId}
        title={board.title}
        zoom={zoom}
      />

      <BoardToolbar
        authorFilter={authorFilter}
        board={board}
        dice={
          isRolling ? (
            <SpeakingOrder
              held={dice.held}
              isBusy={rollDieMutation.isPending || resetDiceMutation.isPending}
              isFacilitator={board.isFacilitator}
              myUserId={user?.id}
              onReset={() => resetDiceMutation.mutate()}
              onRoll={() => rollDieMutation.mutate()}
              participants={participants}
              rolls={dice.settled}
              spinningIds={dice.spinningIds}
            />
          ) : null
        }
        isAddingColumn={isAddingColumn}
        isBusy={isBusy}
        isTimerBusy={timerMutation.isPending}
        onAddColumn={(title) => addColumnMutation.mutate(title)}
        onAddingColumnChange={(isAdding) => {
          setIsAddingColumn(isAdding);
          if (isAdding) setLobbyTab('setup');
        }}
        onAuthorFilterChange={setAuthorFilter}
        onHide={() => hideMutation.mutate()}
        onMaxVotesChange={(maxVotes) => maxVotesMutation.mutate(maxVotes)}
        onOpenActions={() => setIsActionsOpen((isOpen) => !isOpen)}
        onPhaseChange={changePhase}
        onReveal={() => revealMutation.mutate()}
        onTakeFacilitation={() => takeFacilitationMutation.mutate()}
        onTimer={(action, seconds) => timerMutation.mutate({action, seconds})}
        openActionCount={countOpenActions(board)}
        receivedAt={dataUpdatedAt}
      />

      {isLobby ? (
        <LobbyView
          facilitatorId={board.facilitatorId}
          game={<WheelGun game={game} isConnected={isConnected} participants={participants} userId={user?.id} />}
          isConnected={isConnected}
          isFacilitator={board.isFacilitator}
          isStarting={phaseMutation.isPending}
          isTakingOver={takeFacilitationMutation.isPending}
          members={members}
          onSetUpBoard={() => setLobbyTab('setup')}
          onStart={() => phaseMutation.mutate(nextOpeningPhase(board))}
          onTakeOver={() => takeFacilitationMutation.mutate()}
          open={!isSettingUp}
          participants={participants}
          preview={
            board.isFacilitator ? (
              <Stack spacing={1.5}>
                <IcebreakerPreview
                  icebreaker={board.icebreaker}
                  isBusy={icebreakerMutation.isPending}
                  isFacilitator={board.isFacilitator}
                  onCustom={(text) => icebreakerMutation.mutate({action: 'custom', text})}
                  onDraw={() => icebreakerMutation.mutate({action: 'draw'})}
                />
                {board.review.items.length > 0 ? (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={board.review.enabled}
                        disabled={actionReviewMutation.isPending}
                        onChange={(event) => actionReviewMutation.mutate(event.target.checked)}
                        size="small"
                      />
                    }
                    label={`Review ${board.review.items.length} open action${
                      board.review.items.length === 1 ? '' : 's'
                    } first`}
                  />
                ) : null}
              </Stack>
            ) : undefined
          }
          retroTitle={board.title}
          startLabel={
            nextOpeningPhase(board) === 'ICEBREAKER' ? 'Start with the icebreaker' : 'Start the retro'
          }
          teamName={teams?.find(({id}) => id === board.teamId)?.name}
        />
      ) : null}

      {isSettingUp ? (
        <Stack direction="row" sx={{alignItems: 'center', flexWrap: 'wrap', gap: 1.5}}>
          <Typography color="textSecondary" variant="textS">
            The team is in the waiting room.
          </Typography>
          <Button onClick={() => setLobbyTab('waiting')} size="small" variant="outlined">
            Back to the waiting room
          </Button>
        </Stack>
      ) : null}

      {board.phase === 'ICEBREAKER' && board.icebreaker ? (
        // Before everything else: the phase has no columns, and a blank board must not hide it.
        <IcebreakerStage
          icebreaker={board.icebreaker}
          isBusy={icebreakerMutation.isPending || answerMutation.isPending || removeAnswerMutation.isPending}
          isFacilitator={board.isFacilitator}
          onAnswer={(text) => answerMutation.mutate(text)}
          onCustom={(text) => icebreakerMutation.mutate({action: 'custom', text})}
          onDraw={() => icebreakerMutation.mutate({action: 'draw'})}
          onHide={() => icebreakerMutation.mutate({action: 'hideAnswers'})}
          onRemoveAnswer={() => removeAnswerMutation.mutate()}
          onReveal={() => icebreakerMutation.mutate({action: 'revealAnswers'})}
          participants={participants}
        />
      ) : board.phase === 'REVIEW' ? (
        <ActionReview
          facilitatorName={facilitatorName}
          isBusy={outcomeMutation.isPending || focusMutation.isPending}
          isFacilitator={board.isFacilitator}
          onComment={(actionId, outcome, comment) => outcomeMutation.mutate({actionId, comment, outcome})}
          onFocus={(actionId) => focusMutation.mutate(actionId)}
          onOutcome={(actionId, outcome) => outcomeMutation.mutate({actionId, outcome})}
          onUndo={(actionId) => outcomeMutation.mutate({actionId, outcome: null})}
          review={board.review}
          stats={actionStats}
        />
      ) : board.columns.length === 0 ? (
        // A blank board: nobody can write until there is somewhere to write.
        <Box sx={{border: '1px dashed', borderColor: 'divider', borderRadius: 2}}>
          {board.isFacilitator ? (
            <EmptyState
              action={
                canEditColumns
                  ? {label: 'Add a column', onClick: () => setIsAddingColumn(true)}
                  : undefined
              }
              message="Name the first column, and people can start writing in it."
              title="Add at least one column to start"
            />
          ) : (
            <EmptyState
              message="Notes can be written as soon as there is a column to put them in."
              title="The facilitator is setting up the columns."
            />
          )}
        </Box>
      ) : (
        /*
         * The columns share the width and the board scrolls sideways when there are more
         * than the screen holds. The inner box spans the whole scrolled content, so cursor
         * positions stay fractions of the full board rather than of the visible slice. It
         * hugs the columns, zoom included, so a fraction lands on the same note at any zoom;
         * the cursors themselves stay outside the zoom, at their usual size.
         */
        <SideScroll>
          <Box
            onPointerLeave={hideCursor}
            onPointerMove={onPointerMove}
            ref={setBoardElement}
            sx={{position: 'relative', width: 'max-content'}}
          >
            {!canWrite && !canVote && !isLobby && <CursorLayer cursors={cursors} />}

            <Stack direction="row" sx={{alignItems: 'flex-start', flexWrap: 'nowrap', gap: 2, zoom}}>
              {board.columns.map((column, index) => (
                <BoardColumn
                  authorFilter={activeAuthorFilter}
                  canAddNote={['BRAINSTORM', 'SHARE'].includes(board.phase)}
                  canDecide={canDecide}
                  canEditColumn={board.isFacilitator && canEditColumns}
                  canGroup={canGroup}
                  canRemove={board.columns.length > 1}
                  canReveal={['SHARE', 'VOTE', 'DISCUSS'].includes(board.phase)}
                  canModerate={canModerate}
                  canVote={canVote}
                  canWrite={canWrite}
                  column={column}
                  index={index}
                  isBusy={isBusy}
                  isFacilitator={board.isFacilitator}
                  isLast={index === board.columns.length - 1}
                  key={column.id}
                  onAddNote={(text) => createNoteMutation.mutate({columnId: column.id, text})}
                  onGroupNote={(noteId, targetId) => groupMutation.mutate({noteId, targetId})}
                  onMoveColumn={
                    board.columns.length > 1
                      ? (delta) =>
                          reorderColumnsMutation.mutate(
                            moveColumn(board.columns.map(({id}) => id), index, delta),
                          )
                      : undefined
                  }
                  onMoveNote={(noteId) => moveNoteMutation.mutate({columnId: column.id, noteId})}
                  onRemoveColumn={() =>
                    setConfirmRequest({
                      message: `The ${column.title} column will be removed from the board.`,
                      onConfirm: () => removeColumnMutation.mutate(column.id),
                      title: 'Delete the column?',
                    })
                  }
                  onRemoveNote={(noteId) =>
                    setConfirmRequest({
                      message: 'This note will be permanently removed from the board.',
                      onConfirm: () => removeNoteMutation.mutate(noteId),
                      title: 'Delete the note?',
                    })
                  }
                  onRenameCluster={(clusterId, title) =>
                    renameClusterMutation.mutate({clusterId, title})
                  }
                  onRevealNote={(noteId, revealed) => noteRevealMutation.mutate({noteId, revealed})}
                  onRenameColumn={(title) => updateColumnMutation.mutate({columnId: column.id, title})}
                  onTurnIntoAction={(text) => {
                    setActionDraft({nonce: Date.now(), text});
                    setIsActionsOpen(true);
                  }}
                  onUngroupNote={(noteId) => ungroupMutation.mutate(noteId)}
                  onUpdateNote={(noteId, text) => updateNoteMutation.mutate({noteId, text})}
                  onUpdatePrompt={(prompt) => updateColumnMutation.mutate({columnId: column.id, prompt})}
                  onVote={(targetId, delta) => voteMutation.mutate({delta, targetId})}
                  ranks={ranks}
                  showTotals={board.votesRevealed}
                  votesLeft={board.myVotesLeft}
                />
              ))}
            </Stack>
          </Box>
        </SideScroll>
      )}

      <Drawer
        anchor="right"
        ModalProps={{keepMounted: true}}
        onClose={() => setIsActionsOpen(false)}
        open={isActionsOpen}
        slotProps={{paper: {sx: {bgcolor: SLIPSTREAM.surface, width: {xs: '100%', sm: ACTIONS_WIDTH}}}}}
        variant={isWide ? 'persistent' : 'temporary'}
      >
        <Stack divider={<Divider />} spacing={3} sx={{p: 3}}>
          <Stack direction="row" sx={{alignItems: 'center', justifyContent: 'space-between'}}>
            <Typography variant="headingL">Actions</Typography>
            <IconButton aria-label="Close the actions" onClick={() => setIsActionsOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <ActionList
            actions={board.actions}
            canComplete={false}
            canCreate={canDecide}
            draft={actionDraft}
            emptyLabel="No action decided yet."
            isBusy={isBusy}
            members={members ?? []}
            onCreate={(text, assigneeId) => createActionMutation.mutate({assigneeId, text})}
            onDraftApplied={() => setActionDraft(undefined)}
            onStatusChange={onStatusChange}
            onTextChange={onTextChange}
            title="Actions from this retro"
          />

          {board.review.items.length > 0 ? (
            <ActionList
              actions={board.review.items.map(({action}) => action)}
              canComplete={REVIEW_OUTCOME_PHASES.includes(board.phase)}
              canCreate={false}
              emptyLabel=""
              isBusy={isBusy}
              members={members ?? []}
              onStatusChange={(actionId, status) => reviewMutation.mutate({actionId, status})}
              onTextChange={onTextChange}
              title="Actions from previous retros"
            />
          ) : null}
        </Stack>
      </Drawer>

    </Stack>
  );
};
