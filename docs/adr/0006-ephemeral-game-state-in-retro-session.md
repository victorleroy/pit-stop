# ADR-006 — Ephemeral game state in `RetroSession`

**Status:** adopted. Builds on [ADR-001](0001-architecture.md) D1.

## Context

The waiting room has a shared game, Wheel Gun: cars cross a pit lane and players fit their
wheels. Everybody must see the same cars at the same place, a wheel goes to one person only,
and the game must never weigh on the retro. It carries no retro content and has no stake.

## Decisions

### D1 — In the actor, nowhere else

The game state (cars, attempts, scores) lives in the retro's `RetroSession`, beside the
connections, in a pure `LobbyGame` with an injected clock and random source. No table, no
`projectBoard`, no `board.updated`: it travels in its own `game.*` events. It is lost on a
restart or when the last person leaves, like the presence (CONTRIBUTING, "One instance").

### D2 — A schedule from the service, kinematics on the client

The service draws each car (lane, spawn time, speed, livery) and sends them in chunks of 10 s,
ahead of time. Every client computes positions from the same linear formula and the service
clock (`serverNow`). Rejected: a seed shared with a PRNG duplicated in `service/` and `web/`
(no shared package, versions drift apart); positions ticked by the service (30 recipients at
10-20 Hz for nothing, since the motion is linear). The service arms one interval, and only
while somebody plays.

### D3 — Proportionate anti-cheat

The service judges every hit: known car and wheel, wheel free, inside its on-screen window
give or take 300 ms, and **one attempt per person, car and wheel**, forgotten with the car.
No click coordinate is sent or checked. A scripted client can still take every wheel as soon
as it shows: it wins the waiting room and nothing else, which is accepted.

### D4 — Access re-checked per chunk

There is no board broadcast while in `LOBBY` to evict somebody who lost access, so joining
and every chunk of cars re-authorize each player's token. A member removed from the team stops
receiving the game within 10 s; the cost is one read per player every 10 s.

## Consequences

- A hit that lands between the phase commit and the end of the board broadcast can still
  count; it changes nothing in the retro.
- Two tabs of one person are one player.
- The game adds four outbound and three inbound websocket messages (BEHAVIOUR.md section 8).
