// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionStats, Review, ReviewItem } from "@/api/types";
import { ActionReview, nextFocus } from "@/components/ActionReview";

const item = (
  id: string,
  overrides: Partial<ReviewItem> = {},
  status = "OPEN",
): ReviewItem => ({
  action: {
    closedAt: null,
    createdAt: new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString(),
    id,
    retroId: "r1",
    retroTitle: "Sprint 12",
    status: status as "OPEN",
    text: `Action ${id}`,
  },
  ...overrides,
});

const stats: ActionStats = {
  completionTrend: [],
  doneSinceLastRetro: 3,
  droppedSinceLastRetro: 1,
  openCount: 5,
};

const handlers = () => ({
  onComment: vi.fn(),
  onFocus: vi.fn(),
  onOutcome: vi.fn(),
  onUndo: vi.fn(),
});

const renderReview = (
  items: ReviewItem[],
  props: {
    facilitatorName?: string;
    focusActionId?: string | null;
    isFacilitator?: boolean;
    stats?: ActionStats;
  } = {},
  actions = handlers(),
) => {
  const review: Review = {
    enabled: true,
    focusActionId: props.focusActionId ?? null,
    items,
  };
  render(
    <ActionReview
      facilitatorName={props.facilitatorName}
      isBusy={false}
      isFacilitator={props.isFacilitator ?? false}
      review={review}
      stats={props.stats}
      {...actions}
    />,
  );
  return actions;
};

const decided = (
  id: string,
  outcome: "DONE" | "DROPPED" | "KEPT",
  extra = {},
) => item(id, { outcome, ...extra });

afterEach(cleanup);

describe("nextFocus", () => {
  const items = [item("a"), decided("b", "DONE"), item("c"), item("d")];

  it("starts on the first undecided item without focus", () => {
    expect(nextFocus(items, null)).toBe("a");
  });

  it("skips decided items", () => {
    expect(nextFocus(items, "a")).toBe("c");
  });

  it("wraps around to an undecided item", () => {
    expect(nextFocus(items, "d")).toBe("a");
  });

  it("moves in order without wrapping once everything is decided", () => {
    const all = [decided("a", "DONE"), decided("b", "KEPT")];
    expect(nextFocus(all, "a")).toBe("b");
    expect(nextFocus(all, "b")).toBeNull();
  });

  it("returns null without items", () => {
    expect(nextFocus([], null)).toBeNull();
  });
});

describe("ActionReview", () => {
  it("shows the metrics banner from the stats", () => {
    renderReview([item("a")], { stats });
    expect(screen.getByText(/done since last retro/).textContent).toBe(
      "3 done since last retro · 1 dropped · 5 open",
    );
  });

  it("hides the banner without stats", () => {
    renderReview([item("a")]);
    expect(screen.queryByText(/done since last retro/)).toBeNull();
  });

  it("lists the actions in order and marks the focused one", () => {
    renderReview([item("a"), item("b"), item("c")], { focusActionId: "b" });
    const rows = screen.getAllByRole("listitem");
    expect(
      rows.map((row) => within(row).getAllByText(/^Action/)[0].textContent),
    ).toEqual(["Action a", "Action b", "Action c"]);
    expect(rows[1].getAttribute("aria-current")).toBe("true");
    expect(rows[0].getAttribute("aria-current")).toBeNull();
  });

  it("records Done, Drop and Keep", () => {
    const actions = renderReview([item("a")]);
    fireEvent.click(
      screen.getByRole("button", { name: 'Mark "Action a" as done' }),
    );
    fireEvent.click(screen.getByRole("button", { name: 'Drop "Action a"' }));
    fireEvent.click(screen.getByRole("button", { name: 'Keep "Action a"' }));
    expect(actions.onOutcome.mock.calls).toEqual([
      ["a", "DONE"],
      ["a", "DROPPED"],
      ["a", "KEPT"],
    ]);
  });

  it("undoes an outcome", () => {
    const actions = renderReview([
      decided("a", "DONE", { reviewedBy: { id: "u1", name: "Ada" } }),
    ]);
    expect(screen.getByText("by Ada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(actions.onUndo).toHaveBeenCalledWith("a");
  });

  it("saves a trimmed comment on Enter and clears a blank one", () => {
    const actions = renderReview([decided("a", "KEPT")]);
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "  later  " },
    });
    fireEvent.keyDown(screen.getByLabelText("Comment (optional)"), {
      key: "Enter",
    });
    expect(actions.onComment).toHaveBeenCalledWith("a", "KEPT", "later");
  });

  it("sends null for a blank comment replacing an existing one", () => {
    const actions = renderReview([
      decided("a", "DONE", { comment: "shipped" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "shipped" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "  " },
    });
    fireEvent.keyDown(screen.getByLabelText("Comment (optional)"), {
      key: "Enter",
    });
    expect(actions.onComment).toHaveBeenCalledWith("a", "DONE", null);
  });

  it("does not save an unchanged comment or an escaped one", () => {
    const actions = renderReview([
      decided("a", "DONE", { comment: "shipped" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "shipped" }));
    fireEvent.keyDown(screen.getByLabelText("Comment (optional)"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("button", { name: "shipped" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "other" },
    });
    fireEvent.keyDown(screen.getByLabelText("Comment (optional)"), {
      key: "Escape",
    });
    expect(actions.onComment).not.toHaveBeenCalled();
  });

  it("gives non-facilitators no navigation and no row focus", () => {
    const actions = renderReview([item("a")], { facilitatorName: "Grace" });
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByText("Grace is leading the review")).toBeTruthy();
    fireEvent.click(screen.getByText("Action a"));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(actions.onFocus).not.toHaveBeenCalled();
  });

  it("lets the facilitator focus a row by clicking it", () => {
    const actions = renderReview([item("a")], { isFacilitator: true });
    fireEvent.click(screen.getByText("Action a"));
    expect(actions.onFocus).toHaveBeenCalledWith("a");
  });

  it("moves to the next undecided item and wraps", () => {
    const items = [item("a"), decided("b", "DONE"), item("c")];
    const actions = renderReview(items, {
      focusActionId: "a",
      isFacilitator: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(actions.onFocus).toHaveBeenLastCalledWith("c");
  });

  it("wraps from the last item", () => {
    const actions = renderReview([item("a"), item("b")], {
      focusActionId: "b",
      isFacilitator: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(actions.onFocus).toHaveBeenLastCalledWith("a");
  });

  it("moves with the arrow keys", () => {
    const actions = renderReview([item("a"), item("b")], {
      focusActionId: "a",
      isFacilitator: true,
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(actions.onFocus).toHaveBeenCalledWith("b");
  });

  it("leaves the arrow keys to an open dialog", () => {
    const actions = renderReview([item("a"), item("b")], {
      focusActionId: "a",
      isFacilitator: true,
    });
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    fireEvent.keyDown(button, { key: "ArrowRight" });
    expect(actions.onFocus).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("dims no row when the focused action left the review", () => {
    renderReview([item("a"), item("b")], { focusActionId: "gone" });
    for (const row of screen.getAllByRole("listitem"))
      expect(getComputedStyle(row).opacity).toBe("1");
  });

  it("shows the empty state", () => {
    renderReview([]);
    expect(screen.getByText("No open actions to review")).toBeTruthy();
  });

  it("summarises once every action is decided", () => {
    renderReview([
      decided("a", "DONE"),
      decided("b", "DROPPED"),
      decided("c", "KEPT"),
    ]);
    expect(screen.getByText("All actions reviewed")).toBeTruthy();
    expect(screen.getByText("1 done · 1 dropped · 1 kept")).toBeTruthy();
  });

  it("flags a status that diverges from the outcome", () => {
    renderReview([
      item("a", { outcome: "KEPT" }, "DONE"),
      item("b", { outcome: "DONE" }, "DONE"),
      item("c", { outcome: "KEPT" }, "OPEN"),
    ]);
    expect(screen.getAllByText(/Status changed since/)).toHaveLength(1);
    expect(screen.getByText("Status changed since: Done")).toBeTruthy();
  });

  it("names a deleted retro", () => {
    const missing = item("a");
    delete missing.action.retroTitle;
    renderReview([missing]);
    expect(screen.getByText("Deleted retro")).toBeTruthy();
  });
});
