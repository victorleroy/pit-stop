import { Box, Button, Chip, Stack, TextField, Tooltip, Typography } from "@/ui";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type {
  ActionStats,
  ActionStatus,
  Review,
  ReviewItem,
  ReviewOutcome,
} from "@/api/types";
import { Sparkline } from "@/components/FollowThrough";
import { UserAvatar } from "@/components/UserAvatar";

const COMMENT_MAX = 300;

const OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  DONE: "Done",
  DROPPED: "Dropped",
  KEPT: "Kept",
};

const STATUS_LABELS: Record<ActionStatus, string> = {
  DONE: "Done",
  DROPPED: "Dropped",
  OPEN: "Open",
};

const AGREEING_STATUS: Record<ReviewOutcome, ActionStatus> = {
  DONE: "DONE",
  DROPPED: "DROPPED",
  KEPT: "OPEN",
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const timeAgo = (iso: string, now = Date.now()) => {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? [
    "minute",
    60,
  ];
  return format.format(Math.round(seconds / size), unit);
};

export const nextFocus = (
  items: ReviewItem[],
  focusActionId: string | null,
): string | null => {
  if (items.length === 0) return null;
  const index = items.findIndex(({ action }) => action.id === focusActionId);
  if (index < 0)
    return (items.find(({ outcome }) => !outcome) ?? items[0]).action.id;

  const ordered = [...items.slice(index + 1), ...items.slice(0, index)];
  const undecided = ordered.find(({ outcome }) => !outcome);
  if (undecided) return undecided.action.id;
  return items[index + 1]?.action.id ?? null;
};

const previousFocus = (
  items: ReviewItem[],
  focusActionId: string | null,
): string | null => {
  const index = items.findIndex(({ action }) => action.id === focusActionId);
  return index > 0 ? items[index - 1].action.id : null;
};

const ownsArrowKeys = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
    target.isContentEditable ||
    target.closest(
      '[role="dialog"], [role="menu"], [role="listbox"], [role="radiogroup"], [role="slider"], [role="tablist"]',
    ) !== null);

const CommentEditor = ({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (comment: string | null) => void;
}) => {
  const [value, setValue] = useState(initial);
  const settled = useRef(false);

  const save = () => {
    if (settled.current) return;
    settled.current = true;
    const trimmed = value.trim();
    if (trimmed === initial) onCancel();
    else onSave(trimmed || null);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      settled.current = true;
      onCancel();
    }
  };

  return (
    <TextField
      autoFocus
      fullWidth
      helperText={`${value.length}/${COMMENT_MAX}`}
      label="Comment (optional)"
      onBlur={save}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      size="small"
      slotProps={{ htmlInput: { maxLength: COMMENT_MAX } }}
      value={value}
    />
  );
};

const DecisionButton = ({
  children,
  color,
  disabled,
  label,
  onClick,
  title,
  variant = "text",
}: {
  children: string;
  color?: "error" | "primary";
  disabled: boolean;
  label: string;
  onClick: () => void;
  title: string;
  variant?: "contained" | "text";
}) => (
  <Tooltip describeChild title={title}>
    <span>
      <Button
        aria-label={label}
        color={color}
        disabled={disabled}
        onClick={onClick}
        size="small"
        sx={color ? undefined : { color: "text.secondary" }}
        variant={variant}
      >
        {children}
      </Button>
    </span>
  </Tooltip>
);

const ReviewRow = ({
  hasFocus,
  isBusy,
  isFacilitator,
  isFocused,
  item,
  onComment,
  onFocus,
  onOutcome,
  onUndo,
}: {
  hasFocus: boolean;
  isBusy: boolean;
  isFacilitator: boolean;
  isFocused: boolean;
  item: ReviewItem;
  onComment: (
    actionId: string,
    outcome: ReviewOutcome,
    comment: string | null,
  ) => void;
  onFocus: (actionId: string | null) => void;
  onOutcome: (actionId: string, outcome: ReviewOutcome) => void;
  onUndo: (actionId: string) => void;
}) => {
  const { action, comment, outcome, reviewedBy } = item;
  const ref = useRef<HTMLLIElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const diverges =
    outcome !== undefined && AGREEING_STATUS[outcome] !== action.status;

  useEffect(() => {
    if (isFocused)
      ref.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [isFocused]);

  const handleClick = (event: MouseEvent) => {
    if (!isFacilitator) return;
    if ((event.target as HTMLElement).closest("button, input, textarea, a"))
      return;
    onFocus(action.id);
  };

  const decide = (next: ReviewOutcome) => () => onOutcome(action.id, next);

  return (
    <Box
      aria-current={isFocused ? "true" : undefined}
      component="li"
      onClick={handleClick}
      ref={ref}
      role="listitem"
      sx={{
        "& .decisions": {
          opacity: isFocused ? 1 : 0,
          transition: "opacity 120ms",
        },
        "&:focus-within .decisions, &:hover .decisions": { opacity: 1 },
        "@media (hover: none)": { "& .decisions": { opacity: 1 } },
        border: 1,
        borderColor: isFocused ? "primary.main" : "divider",
        borderRadius: 1,
        cursor: isFacilitator ? "pointer" : "default",
        listStyle: "none",
        opacity: hasFocus && !isFocused ? 0.6 : 1,
        px: 2,
        py: 1.5,
        transition: "opacity 120ms",
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "flex-start", flexWrap: "wrap" }}
        >
          <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 220 }}>
            <Typography sx={{ fontWeight: isFocused ? 600 : 400 }}>
              {action.text}
            </Typography>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: "center",
                color: "text.secondary",
                flexWrap: "wrap",
              }}
            >
              {action.assignee && (
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ alignItems: "center" }}
                >
                  <UserAvatar
                    decorative
                    id={action.assignee.id}
                    name={action.assignee.name}
                    size="small"
                    sx={{ height: 20, width: 20, fontSize: 10 }}
                  />
                  <Typography variant="caption">
                    {action.assignee.name}
                  </Typography>
                </Stack>
              )}
              <Typography variant="caption">
                {action.retroTitle ?? "Deleted retro"}
              </Typography>
              {action.createdAt && (
                <Typography variant="caption">
                  {timeAgo(action.createdAt)}
                </Typography>
              )}
              {diverges && (
                <Typography variant="caption">
                  Status changed since: {STATUS_LABELS[action.status]}
                </Typography>
              )}
            </Stack>
          </Stack>
          <Stack
            className="decisions"
            direction="row"
            spacing={0.5}
            sx={{ alignItems: "center" }}
          >
            <DecisionButton
              color="error"
              disabled={isBusy || outcome === "DROPPED"}
              label={`Drop "${action.text}"`}
              onClick={decide("DROPPED")}
              title="Abandon this action, keep it in history"
            >
              Drop
            </DecisionButton>
            <DecisionButton
              disabled={isBusy || outcome === "KEPT"}
              label={`Keep "${action.text}"`}
              onClick={decide("KEPT")}
              title="Still relevant, carry it over"
            >
              Keep
            </DecisionButton>
            <DecisionButton
              color="primary"
              disabled={isBusy || outcome === "DONE"}
              label={`Mark "${action.text}" as done`}
              onClick={decide("DONE")}
              title="Mark as done"
              variant="contained"
            >
              Done
            </DecisionButton>
          </Stack>
        </Stack>
        {outcome && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Chip
              color={
                outcome === "DONE"
                  ? "success"
                  : outcome === "DROPPED"
                    ? "error"
                    : "default"
              }
              label={OUTCOME_LABELS[outcome]}
              size="small"
              variant="outlined"
            />
            {reviewedBy && (
              <Typography sx={{ color: "text.secondary" }} variant="caption">
                by {reviewedBy.name}
              </Typography>
            )}
            <Button
              disabled={isBusy}
              onClick={() => onUndo(action.id)}
              size="small"
              sx={{ color: "text.secondary" }}
            >
              Undo
            </Button>
            {!isEditing && (
              <Button
                onClick={() => setIsEditing(true)}
                size="small"
                sx={{ color: "text.secondary", textTransform: "none" }}
              >
                {comment ?? "Add a comment"}
              </Button>
            )}
          </Stack>
        )}
        {outcome && isEditing && (
          <CommentEditor
            initial={comment ?? ""}
            onCancel={() => setIsEditing(false)}
            onSave={(next) => {
              onComment(action.id, outcome, next);
              setIsEditing(false);
            }}
          />
        )}
      </Stack>
    </Box>
  );
};

/** The open actions of earlier retros, walked through together at the start of a retro. */
export const ActionReview = ({
  facilitatorName,
  isBusy,
  isFacilitator,
  onComment,
  onFocus,
  onOutcome,
  onUndo,
  review,
  stats,
}: {
  facilitatorName: string | undefined;
  isBusy: boolean;
  isFacilitator: boolean;
  onComment: (
    actionId: string,
    outcome: ReviewOutcome,
    comment: string | null,
  ) => void;
  onFocus: (actionId: string | null) => void;
  onOutcome: (actionId: string, outcome: ReviewOutcome) => void;
  onUndo: (actionId: string) => void;
  review: Review;
  stats: ActionStats | undefined;
}) => {
  const { focusActionId, items } = review;
  const focused = items.find(({ action }) => action.id === focusActionId);
  const next = nextFocus(items, focusActionId);
  const previous = previousFocus(items, focusActionId);

  useEffect(() => {
    if (!isFacilitator) return undefined;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        ownsArrowKeys(event.target) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target =
        event.key === "ArrowRight"
          ? next
          : event.key === "ArrowLeft"
            ? previous
            : undefined;
      if (target) onFocus(target);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFacilitator, next, onFocus, previous]);

  const count = (outcome: ReviewOutcome) =>
    items.filter((item) => item.outcome === outcome).length;
  const allDecided = items.length > 0 && items.every(({ outcome }) => outcome);

  return (
    <Stack spacing={2} sx={{ display: "flex" }}>
      <Box
        aria-live="polite"
        sx={{
          clip: "rect(0 0 0 0)",
          height: "1px",
          overflow: "hidden",
          position: "absolute",
          width: "1px",
        }}
      >
        {focused ? `Now reviewing: ${focused.action.text}` : ""}
      </Box>
      {stats && (
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography sx={{ color: "text.secondary" }} variant="body2">
            <strong>{stats.doneSinceLastRetro}</strong> done since last retro ·{" "}
            <strong>{stats.droppedSinceLastRetro}</strong> dropped ·{" "}
            <strong>{stats.openCount}</strong> open
          </Typography>
          {stats.completionTrend.length > 0 && (
            <Box sx={{ display: { md: "block", xs: "none" } }}>
              <Sparkline points={stats.completionTrend} />
            </Box>
          )}
        </Stack>
      )}
      {!isFacilitator && facilitatorName && (
        <Typography sx={{ color: "text.secondary" }} variant="caption">
          {facilitatorName} is leading the review
        </Typography>
      )}
      {items.length === 0 && (
        <Typography sx={{ color: "text.secondary" }}>
          No open actions to review
        </Typography>
      )}
      {allDecided && (
        <Box
          sx={{
            border: 1,
            borderColor: "success.main",
            borderRadius: 1,
            px: 2,
            py: 1,
          }}
        >
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            All actions reviewed
          </Typography>
          <Typography sx={{ color: "text.secondary" }} variant="caption">
            {count("DONE")} done · {count("DROPPED")} dropped · {count("KEPT")}{" "}
            kept
          </Typography>
        </Box>
      )}
      {items.length > 0 && (
        <Stack
          component="ul"
          role="list"
          spacing={1}
          sx={{ m: 0, order: 1, p: 0 }}
        >
          {items.map((item) => (
            <ReviewRow
              hasFocus={focused !== undefined}
              isBusy={isBusy}
              isFacilitator={isFacilitator}
              isFocused={item.action.id === focusActionId}
              item={item}
              key={item.action.id}
              onComment={onComment}
              onFocus={onFocus}
              onOutcome={onOutcome}
              onUndo={onUndo}
            />
          ))}
        </Stack>
      )}
      {isFacilitator && items.length > 0 && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            bgcolor: "background.default",
            bottom: 0,
            justifyContent: "flex-end",
            order: { md: 0, xs: 2 },
            position: { md: "static", xs: "sticky" },
            py: 1,
          }}
        >
          <Button
            disabled={!previous}
            onClick={() => previous && onFocus(previous)}
            size="small"
          >
            Previous
          </Button>
          <Button
            disabled={!next}
            onClick={() => next && onFocus(next)}
            size="small"
          >
            Next
          </Button>
        </Stack>
      )}
    </Stack>
  );
};
