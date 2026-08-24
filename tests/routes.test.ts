import assert from "node:assert/strict";
import { after, test } from "node:test";
import { GET as health } from "../app/api/health/route.ts";
import { GET as communityBoard } from "../app/api/community-board/route.ts";
import { GET as leaderboard } from "../app/api/v1/leaderboards/[slug]/route.ts";
import { sql } from "../app/api/_lib/db.ts";

const db = sql;
const testUser = "ci_route_test_user";
const databaseTest = db ? test : test.skip;

after(async () => {
  if (!db) return;
  await db`delete from ballots where user_id = ${testUser}`;
  await db.end();
});

test("health route is explicitly uncacheable", async () => {
  const response = health();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal((await response.json()).status, "ok");
});

databaseTest("community board and historical API return only persisted ballot aggregates", async () => {
  if (!db) throw new Error("DATABASE_URL is required");
  await db`delete from ballots where user_id = ${testUser}`;
  const inserted = await db`
    insert into ballots (user_id, category_slug, placements, ranked_count, revision)
    values (${testUser}, 'overall', ${db.json({ "gpt-5-6-sol": "S", "claude-opus-5": "A", "kimi-k3": "B", "mistral-large": "C", "glm-5-3": "D" })}, 5, 1)
    returning id, placements
  `;
  await db`insert into ballot_revisions (ballot_id, user_id, category_slug, revision, placements, ranked_count) values (${inserted[0].id}, ${testUser}, 'overall', 1, ${db.json(inserted[0].placements)}, 5)`;
  const response = await communityBoard(new Request("http://localhost/api/community-board?category=overall"));
  assert.equal(response.status, 200);
  const body = await response.json() as { scores: Record<string, { score: number; voters: number; distribution: Record<string, number> }> };
  assert.equal(body.scores["gpt-5-6-sol"].score, 6);
  assert.equal(body.scores["gpt-5-6-sol"].voters, 1);
  assert.equal(body.scores["gpt-5-6-sol"].distribution.S, 1);
  assert.equal(body.scores["gpt-5-6-sol"].distribution.A, 0);

  const historical = await leaderboard(new Request("http://localhost/api/v1/leaderboards/overall"), { params: Promise.resolve({ slug: "overall" }) });
  const historyBody = await historical.json() as { data: Array<{ id: string; score: number; voters: number }> };
  assert.deepEqual(historyBody.data.map(({ id, score, voters }) => ({ id, score, voters })), [
    { id: "gpt-5-6-sol", score: 6, voters: 1 },
    { id: "claude-opus-5", score: 5, voters: 1 },
    { id: "kimi-k3", score: 4, voters: 1 },
    { id: "mistral-large", score: 3, voters: 1 },
    { id: "glm-5-3", score: 2, voters: 1 },
  ]);
});
