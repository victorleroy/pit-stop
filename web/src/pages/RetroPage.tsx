import CloseIcon from '@mui/icons-material/Close';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import {useTheme} from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  Box,
  IconButton,
  Loader,
  Stack,
  Typography,
} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {PointerEvent as ReactPointerEvent, ReactNode} from 'react';
import {useEffect, useRef, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {
  addColumn,
  castVote,
  createAction,
  createNote,
  drawSpeakingOrder,
  fetchBoard,
  groupNote,
  hideMyNotes,
  removeColumn,
  removeNote,
  renameCluster,
  takeFacilitation,
  renameColumn,
  reorderColumns,
  revealMyNotes,
  setNoteRevealed,
  ungroupNote,
  updateAction,
  updateNote,
  updateRetro,
} from '@/api/retros';
import {fetchTeamMembers} from '@/api/teams';
import type {ActionStatus, Board, RetroPhase, TimerAction} from '@/api/types';
import type {ConfirmRequest} from '@/components/ConfirmDialog';
import {ConfirmDialog} from '@/components/ConfirmDialog';
import {ActionList} from '@/components/ActionList';
import {BoardColumn} from '@/components/BoardColumn';
import {CursorLayer} from '@/components/CursorLayer';
import {EmptyState} from '@/components/EmptyState';
import {useToast} from '@/contexts/ToastContext';
import {BoardToolbar} from '@/components/BoardToolbar';
import {PresenceBar} from '@/components/PresenceBar';
import {SpeakingOrder} from '@/components/SpeakingOrder';
import {useBoardSocket} from '@/hooks/useBoardSocket';
import {SLIPSTREAM} from '@/ui/theme';
import {readZoom, saveZoom, stepZoom} from '@/utils/boardZoom';
import {boardAuthors} from '@/utils/authorFilter';
import {moveColumn} from '@/utils/columnOrder';
import {countOpenActions} from '@/utils/openActions';

// Only used while the websocket is down.
const FALLBACK_POLL_INTERVAL_MS = 5_000;

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

  const onBoard = (next: Board) => queryClient.setQueryData(queryKey, next);

  const {cursors, hideCursor, isConnected, participants, sendCursor, speakingOrder} = useBoardSocket({
    onBoard,
    retroId,
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

  const {data: members} = useQuery({
    enabled: Boolean(board?.teamId),
    queryFn: () => fetchTeamMembers(board?.teamId as string),
    queryKey: ['teams', board?.teamId, 'members'],
  });

  const phaseMutation = useMutation({
    mutationFn: (phase: RetroPhase) => updateRetro(retroId as string, {phase}),
    ...boardMutationOptions,
  });
  const maxVotesMutation = useMutation({
    mutationFn: (maxVotes: number) => updateRetro(retroId as string, {maxVotes}),
    ...boardMutationOptions,
  });
  const takeFacilitationMutation = useMutation({
    mutationFn: () => takeFacilitation(retroId as string),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => queryClient.invalidateQueries({queryKey}),
  });
  const speakingOrderMutation = useMutation({
    mutationFn: () => drawSpeakingOrder(retroId as string),
    onError: (cause: Error) => toast.error(cause.message),
  });
  const timerMutation = useMutation({
    mutationFn: ({action, seconds}: {action: TimerAction; seconds?: number}) =>
      updateRetro(retroId as string, {timer: {action, seconds}}),
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
  const renameColumnMutation = useMutation({
    mutationFn: ({columnId, title}: {columnId: string; title: string}) =>
      renameColumn(retroId as string, columnId, title),
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
  const voteMutation = useMutation({
    mutationFn: ({delta, targetId}: {delta: 1 | -1; targetId: string}) =>
      castVote(retroId as string, targetId, delta),
    ...boardMutationOptions,
  });

  const mutations = [
    phaseMutation,
    maxVotesMutation,
    timerMutation,
    takeFacilitationMutation,
    revealMutation,
    hideMutation,
    noteRevealMutation,
    addColumnMutation,
    renameColumnMutation,
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

    if (!box.width || !box.height) return;

    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;

    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    sendCursor(x, y);
  };

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

  return (
    // The open panel takes the board's right edge, so the columns narrow instead of hiding under it.
    <Stack
      spacing={3}
      sx={{pr: isWide && isActionsOpen ? `${ACTIONS_WIDTH}px` : 0, transition: 'padding 225ms ease'}}
    >
      <ConfirmDialog onClose={() => setConfirmRequest(undefined)} request={confirmRequest} />

      <Stack spacing={1}>
        {/* A long title wraps beside the presence, which keeps its corner instead of dropping
            between the title and the way back. */}
        <Stack direction="row" spacing={2} sx={{alignItems: 'flex-start'}}>
          <Typography
            sx={{flexGrow: 1, fontSize: {xs: '1.75rem', sm: undefined}, minWidth: 0, overflowWrap: 'anywhere'}}
            variant="displayS"
          >
            {board.title}
          </Typography>
          <Stack sx={{flexShrink: 0, pt: {xs: 0.5, sm: 1.5}}}>
            <PresenceBar board={board} isConnected={isConnected} participants={participants} />
          </Stack>
        </Stack>
        <SpeakingOrder
          canDraw={board.isFacilitator && isConnected}
          isBusy={speakingOrderMutation.isPending}
          onDraw={() => speakingOrderMutation.mutate()}
          order={speakingOrder}
        />
        <Link
          style={{color: 'inherit', textDecoration: 'none', width: 'fit-content'}}
          to={`/teams/${board.teamId}`}
        >
          <Typography color="textSecondary" variant="textS">
            ← Back to the team
          </Typography>
        </Link>
      </Stack>

      <BoardToolbar
        authorFilter={authorFilter}
        board={board}
        isAddingColumn={isAddingColumn}
        isBusy={isBusy}
        isTimerBusy={timerMutation.isPending}
        onAddColumn={(title) => addColumnMutation.mutate(title)}
        onAddingColumnChange={setIsAddingColumn}
        onAuthorFilterChange={setAuthorFilter}
        onHide={() => hideMutation.mutate()}
        onMaxVotesChange={(maxVotes) => maxVotesMutation.mutate(maxVotes)}
        onOpenActions={() => setIsActionsOpen((isOpen) => !isOpen)}
        onPhaseChange={(phase) => phaseMutation.mutate(phase)}
        onReveal={() => revealMutation.mutate()}
        onTakeFacilitation={() => takeFacilitationMutation.mutate()}
        onTimer={(action, seconds) => timerMutation.mutate({action, seconds})}
        onZoomChange={setZoom}
        openActionCount={countOpenActions(board)}
        receivedAt={dataUpdatedAt}
        zoom={zoom}
      />

      {board.columns.length === 0 ? (
        // A blank board: nobody can write until there is somewhere to write.
        <Box sx={{border: '1px dashed', borderColor: 'divider', borderRadius: 2}}>
          {board.isFacilitator ? (
            <EmptyState
              action={
                board.phase === 'BRAINSTORM'
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
            {!canWrite && !canVote && <CursorLayer cursors={cursors} />}

            <Stack direction="row" sx={{alignItems: 'flex-start', flexWrap: 'nowrap', gap: 2, zoom}}>
              {board.columns.map((column, index) => (
                <BoardColumn
                  authorFilter={activeAuthorFilter}
                  canAddNote={['BRAINSTORM', 'SHARE'].includes(board.phase)}
                  canDecide={canDecide}
                  canEditColumn={board.isFacilitator && board.phase === 'BRAINSTORM'}
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
                  onRenameColumn={(title) => renameColumnMutation.mutate({columnId: column.id, title})}
                  onTurnIntoAction={(text) => {
                    setActionDraft({nonce: Date.now(), text});
                    setIsActionsOpen(true);
                  }}
                  onUngroupNote={(noteId) => ungroupMutation.mutate(noteId)}
                  onUpdateNote={(noteId, text) => updateNoteMutation.mutate({noteId, text})}
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

          {board.carriedOverActions.length > 0 ? (
            <ActionList
              actions={board.carriedOverActions}
              canComplete={false}
              canCreate={false}
              emptyLabel=""
              isBusy={isBusy}
              members={members ?? []}
              onStatusChange={onStatusChange}
              onTextChange={onTextChange}
              title="Actions from previous retros"
            />
          ) : null}
        </Stack>
      </Drawer>

    </Stack>
  );
};
