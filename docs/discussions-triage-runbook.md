# Discussions Triage Runbook

Use this runbook when the app shows stale or empty discussions.

## 1) Check freshness and starvation signals

1. Open `/api/health`
2. Confirm:
   - `discussions.candidateCount24h`
   - `discussions.insertedCount24h`
   - `discussions.latestSuccessfulDiscussionAt`
   - `discussions.healthy`

Interpretation:
- Candidates `> 0` and inserted `= 0` means classifier rejection, write errors, or source-quality problems.
- Candidates `= 0` means ingestion/source starvation.

## 2) Inspect digest diagnostics

1. Open `/api/debug/digest`
2. Check:
   - `counts.discussionCandidates24h.total`
   - `counts.discussionCandidates24h.bySource`
   - `diagnostics.acceptedDiscussionsLast24h`
   - `diagnostics.upsertErrorSummary`

Interpretation:
- Large candidate counts with zero accepted suggests over-strict or low-quality inputs.
- Non-null upsert error indicates DB/schema write issue (enum mismatch, constraints, etc.).

## 3) Check cron run status details

1. Open `/api/cron/status`
2. Check:
   - `discussionDiagnostics.candidateCount`
   - `discussionDiagnostics.candidatesBySource`
   - `discussionDiagnostics.upsertErrorSummary`
   - `discussionDiagnostics.lastRunProcessingStats`

## 4) Run manual full trigger and inspect output

Use `Run full trigger` in UI, then inspect response fields:
- `discussionsProcessed`
- `discussionStats.candidateCount`
- `discussionStats.relevantCount`
- `discussionStats.upsertError`
- `discussionAlerts`

## 5) Source-specific checks

- Reddit: verify credentials; `401` means token/auth misconfiguration.
- Twitter/X: ensure `TWITTER_BEARER_TOKEN` and API access tier supports recent search.
- YouTube: ensure `YOUTUBE_API_KEY` is configured and quota available.
- Search: verify `BRAVE_SEARCH_API_KEY` and monthly cap status.

## 6) Common remediation paths

- `upsertError` present: fix schema/type mismatch first (especially enum drift).
- Candidates too low: expand source filters and query coverage.
- Candidates high but accepted low: tune prefilter/query quality and adjust LLM prompt.
