# Contributing

Thank you for looking. Pit Stop is maintained by one person in their spare time: issues and
pull requests are read, on a best-effort basis, with no promised delay.

## Licence of contributions

Pit Stop is licensed under the GNU AGPL v3. By opening a pull request you agree that your
contribution is licensed under the same terms (*inbound = outbound*). There is no CLA to sign.

One exception: the icebreaker question bank, `service/src/Icebreaker/questions.ts`, is in the
public domain under CC0-1.0, so a self-hosted copy can change it without tracking anyone. A
contribution to that file is made under CC0-1.0.

A question of the bank is original (never copied from another list), light and playful,
answerable in one short sentence, and stays clear of family, health, religion, politics and money. It exists in English
and French, at most 140 characters each. Retire a question with `active: false`; never delete
it or reuse its id.

## Before writing code

- Open an issue first for anything bigger than a bug fix, so we agree on the behaviour before
  you spend an evening on it.
- `docs/BEHAVIOUR.md` describes what the product does. A change of behaviour changes that
  document in the same pull request.
- Decisions with lasting consequences get an ADR in `docs/adr/`.

## Ground rules the code relies on

- **Anonymity lives in `RetroManager.projectBoard`.** Every rule about what a participant may
  see goes through it, for HTTP and websocket alike. A change there needs tests for every phase.
- **Tenant isolation is a type.** Application code reads tenant-owned tables through
  `ScopedDb`; the raw database is reserved for migrations and the paddock.
- **Nothing reads a board on behalf of an operator.** No support tool, no export from the
  paddock, no impersonation. Pull requests adding one will be declined.
- **One instance.** Live retros are in-memory actors; nothing may assume a second process.

## Checks

```bash
npm run setup
npm test
npm run build
```

Tests run the real managers against a throwaway SQLite file, without mocks. Add a test that
fails without your change.

## Security issues

Never in a public issue: see [SECURITY.md](SECURITY.md).
