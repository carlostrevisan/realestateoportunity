# Testing Guidelines — Florida Real Estate Opportunity Engine

This document defines the testing conventions for all three layers of the stack.
Follow these rules to keep tests fast, isolated, and maintainable as the project scales.

---

## Stack at a Glance

| Layer | Runner | Key Libraries |
|-------|--------|---------------|
| Frontend (React/Vite) | **Vitest** | React Testing Library, MSW, jsdom |
| Backend (Express) | **Jest** | Supertest |
| Python data engine | **pytest** | pytest-mock, pytest-cov |
| End-to-end (future) | **Playwright** | requires running Docker stack |

---

## How to Run Tests

```bash
# Frontend
cd client
npm install
npm test              # run once
npm run test:watch    # watch mode (re-runs on save)
npm run test:coverage # coverage report

# Backend (Node/Express)
cd server
npm install
npm test
npm run test:watch
npm run test:coverage

# Python data engine
cd data-engine
pip install pytest pytest-mock pytest-cov
pytest                          # run all tests
pytest --cov=. --cov-report=term-missing  # with coverage
pytest tests/test_cleaner.py    # single file
pytest -k "test_price"          # filter by test name
```

---

## File Naming & Placement

### Frontend

- **Unit/integration tests** live in `__tests__/` subdirectories co-located with
  the source they test.
  ```
  src/
    components/
      UI.jsx
      __tests__/
        UI.test.jsx          ← tests for UI.jsx
    pages/
      Dashboard.jsx
      __tests__/
        Dashboard.test.jsx
  ```
- Test files must end in `.test.jsx` (components) or `.test.js` (utilities).
- Mock infrastructure lives in `src/test/`:
  ```
  src/test/
    setup.js           ← global setup (MSW start, jest-dom import)
    mocks/
      handlers.js      ← MSW request handlers (API fixtures)
      server.js        ← MSW node server instance
  ```
- Manual module mocks live in `src/__mocks__/` (e.g., `leaflet.js`).

### Backend (Node/Express)

- Tests live in `server/__tests__/`, named after the route module they cover:
  ```
  server/
    routes/
      opportunities.js
    __tests__/
      opportunities.test.js
      scrape.test.js
  ```

### Python

- Tests live in `data-engine/tests/`, prefixed with `test_`:
  ```
  data-engine/
    cleaner.py
    db.py
    tests/
      conftest.py          ← shared fixtures, env setup
      test_cleaner.py
      test_db.py
  ```

---

## Arrange – Act – Assert (AAA) Pattern

Every test must follow AAA. Use comments to mark the three sections:

```jsx
// Frontend example
it("shows the Reset button when a filter is active", async () => {
  // Arrange
  const user = userEvent.setup();
  render(<Dashboard />);

  // Act
  await user.type(screen.getByRole("spinbutton"), "50000");

  // Assert
  expect(screen.getByRole("button", { name: /Reset/i })).toBeInTheDocument();
});
```

```js
// Express example
it("returns 400 when market is invalid", async () => {
  // Arrange
  const { app } = buildApp();

  // Act
  const res = await request(app)
    .post("/api/scrape/trigger")
    .send({ type: "for_sale", market: "miami" });

  // Assert
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/invalid market/i);
});
```

```python
# Python example
def test_price_below_lower_bound_is_removed(self):
    # Arrange
    df = df_from_rows(make_row(list_price=99_999))
    # Act
    result = clean(df)
    # Assert
    assert result.empty
```

---

## What Constitutes a Passing Test

A test **passes** when all of the following are true:

1. **No real network calls** — all `fetch()` / HTTP calls in frontend tests are
   intercepted by MSW. Backend route tests mock `pg` and global `fetch`.
2. **No real database connections** — Python tests mock `psycopg2.connect()`.
   Node tests inject a mocked `pg.Pool`.
3. **No file system side effects** — tests do not write to disk or read from
   `data-engine/models/`.
4. **Deterministic** — the test produces the same result on every run regardless
   of environment, time, or data in a real DB.
5. **Fast** — unit tests should complete in under 100 ms each. If a test is slow,
   it probably has an unintended real I/O call.

---

## Mocking Rules

### Frontend — MSW (Mock Service Worker)

The MSW server is started globally in `src/test/setup.js`. Default handlers live
in `src/test/mocks/handlers.js` and return minimal valid fixtures.

To override a handler for a **single test** (e.g., to simulate a 500 error):

```jsx
import { server } from "../../test/mocks/server.js";
import { http, HttpResponse } from "msw";

server.use(
  http.get("/api/opportunities/filters", () =>
    HttpResponse.json({ error: "DB unavailable" }, { status: 500 })
  )
);
```

The override is automatically reset after each test (`afterEach(() => server.resetHandlers())`).

**Never** mock `fetch` directly with `vi.fn()` — MSW interception is more realistic
because it tests the full request/response cycle including URL construction.

### Backend — pg mock

```js
jest.mock("pg", () => {
  const mockQuery = jest.fn();
  return { Pool: jest.fn(() => ({ query: mockQuery })) };
});
```

Configure per-test responses:
```js
mockQuery
  .mockResolvedValueOnce({ rows: [{ city: "Tampa" }] })  // first call
  .mockResolvedValueOnce({ rows: [{ zip: "33606" }] });   // second call
```

### Python — pytest-mock

```python
def test_something(mocker, mock_cursor):
    mock_cursor.fetchone.return_value = {"id": 42}
    result = db.start_model_run("train")
    assert result == 42
```

The `mock_cursor` fixture (defined in `conftest.py`) patches `psycopg2.connect`
and returns a mock cursor that is automatically reset between tests.

---

## Coverage Targets

| Module | Target |
|--------|--------|
| `cleaner.py` | ≥ 90% |
| `db.py` | ≥ 80% |
| `server/routes/*.js` | ≥ 75% |
| `client/src/components/UI.jsx` | ≥ 90% |
| `client/src/pages/Dashboard.jsx` | ≥ 60% |

Run `npm run test:coverage` or `pytest --cov=. --cov-report=term-missing` to see
the current numbers. Coverage is a guide, not a mandate — a well-designed test
with meaningful assertions is worth more than a line-coverage number.

---

## End-to-End Tests (Future — Playwright)

E2E tests are not yet implemented. When added, they will:

1. Require `docker compose up` to be running.
2. Live in `e2e/` at the repo root.
3. Use Playwright to drive a real browser against `http://localhost:3000`.
4. Cover the full "Arrange-Scrape-Score-Map" happy path.

To add Playwright:
```bash
npm init playwright@latest
```

Configure `playwright.config.js` to point `baseURL` at `http://localhost:3000`
and add a `test:e2e` script to the root `package.json`.
