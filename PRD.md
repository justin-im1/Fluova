# Fluova PRD

## 1. Product Overview

### Product name

Fluova

### One-line summary

Fluova is an adaptive focus app that recommends the best next work session for a user based on their current context and past behavior, using a contextual bandit serving policy and supervised outcome modeling.

### Product thesis

Most focus apps either track sessions or apply static Pomodoro rules. Fluova’s core value is different: it decides what the user should do next.

It treats next-session recommendation as a contextual decision problem:

- observe user context
- choose a session configuration
- observe the outcome
- update future recommendations

The product should feel useful immediately, stay simple on the surface, and be technically rigorous underneath.

## 2. Goals

### Primary goal

Help users choose and complete better focus sessions by recommending a session configuration that improves:

- completion
- self-reported focus quality
- manageable fatigue

### Secondary goals

- reduce decision friction before work
- build a real ML feedback loop from product usage
- create a technically strong, honest, resume-worthy project
- support future personalization improvements without overengineering v1

### Non-goals

- not a task manager
- not a social productivity app
- not a general AI coach
- not full RL in v1
- not a huge scheduling optimization engine

## 3. Target User

### Core user

Students, engineers, and knowledge workers who regularly do focus sessions and whose ideal session length changes depending on context.

### Initial user profile

A user who:

- does repeated deep work
- has variable energy across the day
- works on different task types
- wants help deciding what kind of focus block to do right now
- is willing to give very lightweight feedback after sessions

## 4. Problem Statement

Static defaults like 25-minute Pomodoro assume all users and contexts behave the same. That is not true.

The best next session depends on:

- time of day
- task type
- current energy
- distraction level
- recent fatigue
- recent completion patterns
- prior session outcomes

Users often do not know what session will work best right now. Fluova should make that decision for them in a way that becomes more personalized over time.

## 5. Core Product Experience

### Main loop

User opens Fluova.

Fluova captures current context.

Fluova recommends one next session.

User accepts or overrides it.

User runs the session.

User submits quick post-session feedback.

Fluova computes reward, logs the interaction, and updates future behavior.

### Product promise

Every session helps the system learn what works best for that user.

## 6. Core User Stories

### Recommendation

- As a user, I want one clear recommendation for what focus session to do next.
- As a user, I want the recommendation to reflect my current energy, task, and recent performance.

### Execution

- As a user, I want to start the recommended session in one tap.
- As a user, I want the focus timer experience to be clean and distraction-free.

### Reflection

- As a user, I want to quickly rate how the session went.
- As a user, I want the app to improve based on my outcomes.

### Trust

- As a user, I want a short explanation of why this recommendation was chosen.
- As a user, I want the app to feel adaptive, not random.

## 7. Product Scope

### In scope for v1

- personalized next-session recommendation
- context capture before session
- timer and break flow
- post-session feedback
- session and recommendation logging
- contextual bandit serving policy
- supervised reward model for analysis and fallback
- explanation layer
- user-facing progress dashboard
- developer-facing policy diagnostics
- reward versioning
- policy evaluation pipeline

### Out of scope for v1

- full long-horizon RL
- LLM chat coach
- collaborative rooms
- social features
- calendar integration
- task management suite
- large combinatorial action spaces

## 8. Core Features

### 8.1 Adaptive recommendation card

This is the center of the product.

Shown on the home screen

- recommended focus duration
- recommended break duration
- optional mode label
- short explanation
- confidence bucket
- start button
- alternate options if user wants to override

#### Example

Best next session: 35 min focus / 5 min break

Why:

Your recent afternoon coding sessions perform best around 30–40 minutes.

Your fatigue trend is elevated, so Fluova avoided a longer deep-work block.

### 8.2 Context capture

Context must be fast to enter and useful for the model.

#### Manual context

- task type: coding, writing, reading, studying, admin, other
- energy level: 1–5
- distraction level: 1–5

#### Auto-captured context

- hour of day
- day of week
- time since last session
- streak length
- recent completion rate
- recent fatigue average
- recent focus rating average
- last session duration
- last session completion
- session count in last 24h and 7d

Manual input should take under 5 seconds.

### 8.3 Timer flow

- clean countdown UI
- pause, resume, abandon, complete actions
- optional break timer
- active session state preserved on refresh

### 8.4 Post-session feedback

#### Required

- completed? yes/no
- focus quality rating: 1–5
- fatigue rating: 1–5

#### Optional

- distraction count or bucket
- short note
- whether recommendation felt like a good fit

### 8.5 Explanation layer

Each recommendation includes a short, user-friendly rationale generated from:

- high-signal context features
- recent user-history summaries
- action selection logic

Important: these are product explanations, not perfect faithful explanations of the internal model.

### 8.6 Analytics

#### User-facing

- completion trend
- focus quality trend
- fatigue trend
- best-performing durations by context
- recommendation acceptance rate

#### Developer-facing

- average reward over time
- action distribution
- override rate
- exploration rate
- estimated policy value
- reward by segment
- calibration of supervised model

## 9. ML System Design

### 9.1 Problem formulation

Fluova’s core ML problem is a contextual bandit.

At each recommendation event:

- context is observed
- one action is chosen
- one reward is observed
- policy updates over time

This is the correct formulation for v1 because the product is optimizing the next decision, not a long-term multi-step policy.

### 9.2 Why not full RL

Full RL would only be justified if Fluova modeled multi-step state transitions across days or weeks and optimized delayed outcomes like long-term burnout or habit formation.

That is not v1. Claiming full RL here would be less honest and less defensible than a strong contextual bandit design.

### 9.3 Action space

The action space should be small enough for efficient learning and safe exploration, but meaningful enough to affect outcomes.

#### v1 actions

Each action is a session configuration:

- 25 focus / 5 break / recovery
- 35 focus / 5 break / standard
- 45 focus / 10 break / deep
- 55 focus / 10 break / deep

#### Rationale

These are not “proven optimal” buckets. They are an initial hypothesis set chosen to:

- cover short, medium, and long work blocks
- keep learning tractable
- reduce harmful exploration
- align with familiar user mental models

This action space will be validated and revised after collecting real data.

### 9.4 Context features

#### Immediate context

- hour of day
- day of week
- task type
- energy level
- distraction level

#### Recent behavioral summaries

- rolling completion rate over last N sessions
- rolling focus rating mean
- rolling fatigue mean
- exponentially weighted recent reward
- last session duration
- last session completion
- time since last completed session
- streak length
- session count in last 24h / 7d

#### Action features

- candidate focus duration
- candidate break duration
- candidate mode

#### Personalization strategy

Do not use separate per-user models in v1.

Instead:

- use global policy parameters
- include user-history summary features
- add stronger user-specific adaptation only once enough data exists

This is more realistic under sparse early data.

### 9.5 Reward design

Reward is the most important optimization target in the system and must be treated as a product contract, not a random formula.

#### reward_v1

Let:

- completion_full = 1 if the session is completed, else 0
- completion_fraction = actual_focus_minutes / planned_focus_minutes, clipped to [0,1]
- focus_norm = normalized focus quality from 1–5 to [0,1]
- fatigue_norm = normalized fatigue from 1–5 to [0,1]

Then:

reward_v1 = 0.35 * completion_full + 0.20 * completion_fraction + 0.30 * focus_norm - 0.15 * fatigue_norm

#### Why this reward

It values:

- finishing the planned session
- getting meaningful work done even if incomplete
- maintaining session quality
- avoiding unsustainably fatiguing recommendations

#### Important note

These weights are design choices, not discovered truths. They must be validated later with sensitivity analysis.

#### Risks

Potential failure modes:

- policy over-selects short sessions to maximize completion
- policy avoids demanding but valuable sessions
- policy over-optimizes user comfort instead of useful work

#### Mitigations

- monitor action distribution
- monitor reward by action and user segment
- run reward sensitivity analysis
- revise reward version if behavior becomes degenerate

Reward version must be logged with every session.

### 9.6 Serving policy

#### Primary serving policy

Use LinUCB contextual bandit over the discrete action set.

For each action, LinUCB estimates expected reward from context and adds an uncertainty bonus to support exploration.

#### Why LinUCB

- good fit for tabular data
- supports online updates
- handles uncertainty-aware exploration
- easier to explain and defend than deeper alternatives
- better fit than neural methods for small early datasets

#### Serving flow

Build current context vector.

Score all candidate actions.

Apply exploration constraints.

Select one action.

Log recommendation event with policy metadata.

After outcome is observed, update policy statistics.

### 9.7 Safe exploration

Exploration must be conservative.

#### Constraints

- only explore among top-K plausible actions
- never choose actions below a minimum plausibility threshold
- reduce exploration as confidence grows
- use lower exploration for users with stronger histories
- monitor override and abandonment rates for explored actions

This is necessary to preserve user trust.

### 9.8 Supervised outcome model

Use a separate supervised model for offline analysis, diagnostics, and fallback.

#### Model

XGBoost reward predictor on context-action pairs

#### Purpose

- benchmark the bandit policy
- estimate expected reward offline
- validate features
- simulate candidate action values
- provide fallback recommendation if bandit service fails

#### Inputs

- context features
- candidate action features

#### Output

expected reward estimate

This model is not the main online serving policy in the preferred architecture.

### 9.9 Cold start strategy

Cold start must be handled honestly.

#### At launch

There is no true pooled user dataset yet. Early data will come from:

- the developer’s own usage
- limited pilot users if available
- synthetic data only for simulation/testing, not as proof of real performance

#### New-user behavior

Before enough real interactions exist:

- use conservative defaults
- initialize from a globally pooled policy trained on available early sessions
- bias toward middle-range actions instead of extremes
- keep exploration conservative

The system should not overclaim personalization early.

### 9.10 Offline policy evaluation

Naive offline comparison is invalid in a bandit setting because only the chosen action has an observed reward.

#### Logged fields required

For each recommendation event:

- chosen action
- propensity
- context snapshot
- reward
- policy version
- reward version

#### Evaluation methods

Use:

- inverse propensity scoring (IPS)
- self-normalized IPS
- doubly robust estimation

This is critical to make the policy evaluation story technically credible.

### 9.11 Online evaluation

#### Metrics

- average reward
- completion rate
- average focus quality
- average fatigue
- override rate
- recommendation acceptance rate
- action diversity
- estimated policy value

#### Methods

- compare against fixed baseline policies over time
- use shadow scoring for candidate policies before switching
- run small controlled policy comparisons only if enough traffic exists

### 9.12 Diagnostics

Track:

- reward by action
- reward by context segment
- action distribution over time
- exploration rate
- override rate
- whether short sessions are over-selected
- calibration of supervised reward model
- drift in input context distribution

## 10. Why This Counts as Real ML

Fluova is a real ML system because it includes:

- custom context-action-outcome data
- a defined reward objective
- learned parameters
- online policy updates
- supervised modeling
- off-policy evaluation
- versioned reward and model tracking
- product integration in a real user loop

It is not a heuristic timer and not a thin AI wrapper.

## 11. Functional Requirements

### FR1 Recommendation generation

The app must generate one primary recommendation using the current serving policy.

### FR2 Context capture

The app must capture required manual and automatic context before recommendation execution.

### FR3 Recommendation logging

Each recommendation event must log:

- action
- context snapshot
- policy version
- propensity
- exploration flag
- explanation payload

### FR4 Session lifecycle

The system must support:

- start
- pause
- resume
- complete
- abandon

### FR5 Outcome collection

The system must collect post-session feedback necessary for reward computation.

### FR6 Reward computation

Every session tied to a recommendation event must produce a stored reward value and reward version.

### FR7 Online updates

The contextual bandit must support updates after outcome observation.

### FR8 Offline evaluation

The system must support offline policy evaluation and supervised model analysis jobs.

### FR9 Fallback behavior

If the bandit service is unavailable, the system must fall back to a deterministic recommendation strategy.

## 12. Non-Functional Requirements

### Performance

- recommendation latency under 300 ms
- session actions feel instantaneous

### Reliability

- event logging is durable
- reward computation is idempotent
- active session survives refresh

### Privacy

- only lightweight productivity context is stored
- user data is isolated with proper access controls

### Auditability

each recommendation can be traced to policy version, reward version, and context snapshot

## 13. Data Model

### users

- id
- created_at
- timezone
- onboarding metadata

### sessions

- id
- user_id
- recommendation_event_id
- planned_focus_minutes
- planned_break_minutes
- session_mode
- actual_focus_minutes
- task_type
- energy_level_pre
- distraction_level_pre
- started_at
- ended_at
- completed
- paused_count
- abandoned
- focus_rating_post
- fatigue_rating_post
- distraction_count_post
- note
- completion_fraction
- reward_value
- reward_version

### recommendation_events

- id
- user_id
- shown_at
- chosen_action_id
- recommended_focus_minutes
- recommended_break_minutes
- session_mode
- accepted
- overridden
- override_action_id
- policy_version
- policy_type
- model_version
- propensity
- exploration_flag
- explanation_payload
- context_snapshot

### model_versions

- id
- type
- created_at
- feature_schema_version
- training_window
- reward_version
- metrics_payload
- artifact_uri

### policy_evaluations

- id
- candidate_policy_version
- logged_policy_version
- evaluation_window
- method
- estimated_policy_value
- confidence_interval
- notes

## 14. System Architecture

### Frontend

- Next.js
- TypeScript
- Tailwind
- shadcn/ui

### Product backend

Next.js Route Handlers

handles auth-aware app logic, session endpoints, dashboard queries, and orchestration

### Database

- Supabase Postgres
- Supabase Auth
- row-level security

### ML service

- Python FastAPI
- LinUCB scoring
- policy update logic
- XGBoost inference
- evaluation jobs
- model loading/versioning

### Hosting

- Vercel for app
- Railway / Render / Fly for Python service
- Supabase for DB/Auth

### Background jobs

- scheduled model evaluation
- diagnostics computation
- optional retraining jobs

## 15. API Surface

### GET /recommendation

Returns:

- recommended action
- focus minutes
- break minutes
- mode
- explanation
- confidence bucket
- policy version
- model version if used

### POST /session/start

Starts a session tied to a recommendation event.

### POST /session/complete

Accepts:

- completion status
- actual focus minutes
- focus rating
- fatigue rating
- optional note/distraction info

Computes and stores reward.

### POST /recommendation/override

Logs recommendation rejection and alternate selection.

### GET /analytics/summary

Returns user-facing and policy-facing summary metrics.

## 16. MVP vs Final Target

### MVP

- context capture
- timer flow
- post-session feedback
- deterministic or heuristic recommender
- logging schema
- reward_v1

### Final target

- LinUCB serving policy
- supervised reward model
- logged propensities
- safe exploration
- off-policy evaluation
- explanation layer
- diagnostics dashboard
- reward versioning

## 17. Milestones

### Milestone 1 — Product foundation

Build auth, home screen, recommendation card, timer, reflection flow, and durable logging.

### Milestone 2 — Data contract

Finalize action space, feature schema, session schema, recommendation schema, and reward_v1.

### Milestone 3 — Baseline system

Build deterministic/heuristic recommender and collect initial data.

### Milestone 4 — Supervised model

Train XGBoost reward predictor and validate feature usefulness.

### Milestone 5 — Bandit serving

Implement LinUCB, online updates, propensities, and fallback behavior.

### Milestone 6 — Evaluation and polish

Add off-policy evaluation, analytics, better explanations, and project documentation.

## 18. Main Risks

### Risk: insufficient real data

Mitigation:

- start with small action space
- collect self/pilot data
- use conservative defaults
- avoid overstating personalization early

### Risk: bad reward design

Mitigation:

- version rewards
- run sensitivity analysis
- inspect policy behavior by action

### Risk: exploration harms UX

Mitigation:

- constrain exploration
- reduce uncertainty bonus over time
- monitor overrides and abandonments

### Risk: project sounds stronger than it is

Mitigation:

- clearly separate built vs planned
- document what is actually implemented
- report real findings once data exists

## 19. Resume Project Summary

Fluova is an adaptive productivity app that learns a personalized next-session policy from behavioral context using a contextual bandit serving model, supervised reward prediction, and off-policy evaluation to optimize completion, focus quality, and fatigue tradeoffs over time.

## 20. Final Product Decision

Fluova should be built as a focused applied ML product, not a generic productivity app and not a fake RL demo.

The correct v1 foundation is:

- small meaningful action space
- contextual bandit serving policy
- supervised reward model for analysis
- rigorous logging and evaluation
- honest treatment of cold start and reward design
- clean full-stack product integration

That is the strongest, most useful, and most defensible version to code.
