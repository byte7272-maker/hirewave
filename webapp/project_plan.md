# Hirewave — AI Job Search Automation Platform

## 1. Project Description
Hirewave is an AI-powered job search automation platform for active job seekers. It matches candidates to roles with semantic + skills/salary/location scoring, verifies postings for scams, generates tailored resumes and cover letters, auto-applies after human approval, and provides voice mock interview prep. Target users: mid-to-senior professionals in product, design, and engineering.

## 2. Page Structure
- `/` — Marketing landing page (built)
- `/dashboard` — Post-sign-in workspace home (current phase)
- Future: `/matches`, `/applications`, `/interview`, `/settings`, `/auth`

## 3. Core Features
- [x] Landing page (hero, features, pricing, FAQ, waitlist form)
- [ ] Dashboard home (stats, matches, pipeline, activity, saved jobs)
- [ ] Mock interview (record + save practice responses)
- [ ] Real authentication (email/password)
- [ ] Job matching engine + apply automation (future)

## 4. Data Model Design
(Not yet connected — mock data used for now.)
- users: id, email, name, role, plan
- applications: id, user_id, job, stage, created_at
- matches: id, user_id, job, fit_score
- interview_responses: id, user_id, question, audio_url, note, created_at

## 5. Backend / Third-party Integration Plan
- Backend (Readdy Backend / SaaS Supabase): auth + data storage — planned, not connected
- Integrations (LinkedIn, Gmail, Indeed, etc.): future
- Payments: future (Stripe)

## 6. Development Phase Plan
### Phase 1: Landing page — COMPLETE
### Phase 2: Dashboard home (mock) — current
- Stats overview, job matches with fit scores, application pipeline, recent activity, saved jobs sidebar, mock interview with record + save responses.
### Phase 3: Real auth + data — future
### Phase 4: Matching + apply automation — future