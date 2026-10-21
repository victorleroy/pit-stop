import {
  Box,
  Loader,
  Stack,
  Typography,
} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {
  addColumn,
  castVote,
  createAction,
  createNote,
  fetchBoard,
  groupNote,
  hideMyNotes,
  removeColumn,
  removeNote,
  renameCluster,
  takeFacilitation,
  renameColumn,
  revealMyNotes,
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
import {useBoardSocket} from '@/hooks/useBoardSocket';

// Only used while the websocket is down.
const FALLBACK_POLL_INTERVAL_MS = 5_000;

export const RetroPage = () => {
  const {retroId} = useParams<{retroId: string}>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | undefined>(undefined);

  const queryKey = ['retros', retroId, 'board'];

  const toast = useToast();

  const onBoard = (next: Board) => queryClient.setQueryData(queryKey, next);

  const {cursors, hideCursor, isConnected, participants, sendCursor} = useBoardSocket({
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

  const {data: board, error, isLoading} = useQuery({
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
  const takeFacilitationMutation = useMutation({
    mutationFn: () => takeFacilitation(retroId as string),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => queryClient.invalidateQueries({queryKey}),
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
  const addColumnMutation = useMutation({
    mutationFn: (title: string) => addColumn(retroId as string, title),
    ...boardMutationOptions,
  });
  const renameColumnMutation = useMutation({
    mutationFn: ({columnId, title}: {columnId: string; title: string}) =>
      renameColumn(retroId as string, columnId, title),
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
    }: {
      actionId: string;
      status: ActionStatus;
      teamId: string;
    }) => updateAction(teamId, actionId, {status}),
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
    timerMutation,
    takeFacilitationMutation,
    revealMutation,
    hideMutation,
    addColumnMutation,
    renameColumnMutation,
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
  const onStatusChange = (actionId: string, status: ActionStatus) =>
    updateActionMutation.mutate({actionId, status, teamId: board.teamId});

  return (
    <Stack spacing={3}>
      <ConfirmDialog onClose={() => setConfirmRequest(undefined)} request={confirmRequest} />

      <Stack spacing={1}>
        <Stack direction="row" spacing={2} sx={{alignItems: 'center', flexWrap: 'wrap'}}>
          <Typography sx={{flexGrow: 1}} variant="displayS">
            {board.title}
          </Typography>
          <PresenceBar isConnected={isConnected} participants={participants} />
        </Stack>
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
        board={board}
        onAddColumn={(title) => addColumnMutation.mutate(title)}
        isBusy={isBusy}
        onHide={() => hideMutation.mutate()}
        onPhaseChange={(phase) => phaseMutation.mutate(phase)}
        onReveal={() => revealMutation.mutate()}
        onTakeFacilitation={() => takeFacilitationMutation.mutate()}
        onTimer={(action, seconds) => timerMutation.mutate({action, seconds})}
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
          title="Actions from previous retros"
        />
      ) : null}

      <Box
        onPointerLeave={hideCursor}
        onPointerMove={onPointerMove}
        sx={{position: 'relative'}}
      >
        <CursorLayer cursors={cursors} />

        <Stack
          direction="row"
          spacing={2}
          sx={{alignItems: 'flex-start', flexWrap: 'wrap', pb: 2}}
        >
          {board.columns.map((column, index) => (
            <BoardColumn
              canEditColumn={board.isFacilitator && board.phase === 'BRAINSTORM'}
              canGroup={canGroup}
              canRemove={board.columns.length > 1}
              canModerate={canModerate}
              canVote={canVote}
              canWrite={canWrite}
              column={column}
              index={index}
              isBusy={isBusy}
              isFacilitator={board.isFacilitator}
              key={column.id}
              onAddNote={(text) => createNoteMutation.mutate({columnId: column.id, text})}
              onGroupNote={(noteId, targetId) => groupMutation.mutate({noteId, targetId})}
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
              onRenameColumn={(title) => renameColumnMutation.mutate({columnId: column.id, title})}
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

      {canDecide || board.actions.length > 0 ? (
        <ActionList
          actions={board.actions}
          canComplete={false}
          canCreate={canDecide}
          emptyLabel="No action decided yet."
          isBusy={isBusy}
          members={members ?? []}
          onCreate={(text, assigneeId) => createActionMutation.mutate({assigneeId, text})}
          onStatusChange={onStatusChange}
          title="Actions from this retro"
        />
      ) : null}

    </Stack>
  );
};
