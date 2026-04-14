# NexusLead — Supabase Database Schema Reference

> **Generated**: 2026-04-12  
> **Source**: Reverse-engineered from the NexusLead codebase (migrations, API routes, server actions, TypeScript types)  
> **Auth Provider**: Clerk (users are identified by `user_id` = Clerk's `userId` string, NOT Supabase Auth `uuid`)

---

## Table of Contents

1. [leads](#1-leads)
2. [campaigns](#2-campaigns)
3. [campaign_leads](#3-campaign_leads)
4. [smart_campaigns](#4-smart_campaigns)
5. [smart_email_queue](#5-smart_email_queue)
6. [user_usage](#6-user_usage)
7. [user_settings](#7-user_settings)
8. [tech_data](#8-tech_data)
9. [archive_index](#9-archive_index)
10. [system_settings](#10-system_settings)
11. [admin_audit_logs](#11-admin_audit_logs)
12. [support_tickets](#12-support_tickets)
13. [manual_payment_requests](#13-manual_payment_requests)
14. [Storage Buckets](#14-storage-buckets)
15. [RPC Functions](#15-rpc-functions)
16. [Entity Relationship Diagram](#16-entity-relationship-diagram)

---

## 1. `leads`

> **CRITICAL TABLE** — This is where ALL scraped/searched lead data is stored.  
> Each row belongs to exactly one user (multi-tenant via `user_id`).  
> Leads originate from the Google Places API search and are enriched via web scraping.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `bigint` (auto-increment) | NO | auto | Primary key |
| `user_id` | `text` | NO | — | **Clerk user ID** (FK to authenticated user) |
| `business_name` | `text` | YES | — | Display name from Google Places |
| `address` | `text` | YES | `'N/A'` | Full formatted address |
| `city` | `text` | YES | `'Unknown'` | City extracted from search |
| `category` | `text` | YES | — | Search keyword used (acts as folder/category) |
| `rating` | `numeric` / `float` | YES | `0` | Google rating (0–5) |
| `phone` | `text` | YES | `'N/A'` | Phone number from Google or scraped |
| `website` | `text` | YES | `null` | Business website URL |
| `email` | `text` | YES | `null` | Scraped email (or status like `'Not Found'`, `'N/A'`) |
| `google_place_id` | `text` | YES | — | Unique Google Place ID |
| `facebook` | `text` | YES | `null` | Facebook profile URL (scraped) |
| `instagram` | `text` | YES | `null` | Instagram profile URL (scraped) |
| `twitter` | `text` | YES | `null` | Twitter/X profile URL (scraped) |
| `linkedin` | `text` | YES | `null` | LinkedIn profile URL (scraped) |
| `has_pixel` | `boolean` | YES | `null` | Has Facebook/TikTok/LinkedIn tracking pixel |
| `has_seo` | `boolean` | YES | `null` | Has Yoast/RankMath SEO plugin |
| `mx_valid` | `boolean` | YES | `null` | MX record verification result |
| `is_unsubscribed` | `boolean` | NO | `false` | Lead opted out of emails |
| `unsubscribed_at` | `timestamptz` | YES | `null` | When the lead unsubscribed |
| `email_status` | `text` | YES | `null` | e.g. `'contacted'` |
| `last_contacted_at` | `timestamptz` | YES | `null` | Last time an email was sent |
| `opened_at` | `timestamptz` | YES | `null` | When lead opened a tracked email |
| `last_updated` | `timestamptz` | YES | `null` | Last scrape/update timestamp |
| `created_at` | `timestamptz` | YES | `now()` | Row creation timestamp |

### Unique Constraints
- **Composite**: `(google_place_id, user_id)` — prevents duplicate leads per user

### Key Relationships
- `user_id` → **Clerk User** (not a DB FK, enforced in app logic)
- Referenced by: `campaign_leads.lead_id`, `smart_email_queue.lead_id`

### How Scraped Lists Are Stored
1. User searches via Google Places API → leads are **upserted** into this table with `user_id`, `google_place_id`, `business_name`, `category`, etc.
2. The `category` column acts as the **folder/list grouping** — it equals the search keyword (e.g., "Restaurants in Miami").
3. Users can rename, merge, and move leads between categories via `updateLeadCategory()` and `moveLeadsToFolder()`.
4. Scraping enriches each lead with `email`, `phone`, `facebook`, `instagram`, `twitter`, `linkedin`, `has_pixel`, `has_seo`.
5. MX verification sets `mx_valid`.
6. Leads older than 30 days are archived to the `lead-archives` storage bucket and deleted.

---

## 2. `campaigns`

> **Drip/Sequence Campaigns** — Multi-step email campaigns with per-campaign SMTP credentials.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `user_id` | `uuid` | NO | — | Clerk user ID (cast to uuid in migration, stored as text in app) |
| `user_email` | `text` | YES | — | User's email (denormalized for reference) |
| `name` | `text` | NO | — | Campaign display name |
| `sequence` | `jsonb` | NO | — | Array of `CampaignSequenceStep` objects |
| `status` | `text` | NO | `'active'` | `'active'` \| `'paused'` \| `'completed'` |
| `smtp_host` | `text` | YES | — | SMTP host locked at launch time |
| `smtp_port` | `text` | YES | — | SMTP port locked at launch time |
| `smtp_user` | `text` | YES | — | SMTP user locked at launch time |
| `smtp_pass` | `text` | YES | — | SMTP password locked at launch time |
| `created_at` | `timestamptz` | NO | `now()` | — |

### `sequence` JSONB Structure
```json
[
  {
    "step": 1,
    "wait_days": 0,
    "subject": "Email subject with {{business_name}}",
    "html_body": "<p>HTML body with {{city}}</p>",
    "theme_id": "plainText"
  },
  {
    "step": 2,
    "wait_days": 3,
    "subject": "Follow-up subject",
    "html_body": "<p>Follow-up body</p>",
    "theme_id": "modern"
  }
]
```

### RLS Policy
- `Users can manage own campaigns`: `auth.uid() = user_id`

---

## 3. `campaign_leads`

> Junction table linking **campaigns** to **leads**. Tracks per-lead progress through the drip sequence.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `campaign_id` | `uuid` | NO | — | FK → `campaigns.id` (CASCADE delete) |
| `lead_id` | `uuid` | NO | — | FK → `leads.id` (CASCADE delete) |
| `lead_email` | `text` | YES | — | Denormalized email snapshot |
| `current_step` | `integer` | NO | `1` | Current step in the sequence |
| `next_run_at` | `timestamptz` | NO | `now()` | When the next email should fire |
| `status` | `text` | NO | `'pending'` | `'pending'` \| `'completed'` \| `'failed'` \| `'skipped'` + extended: `'failed_invalid_lead'` \| `'failed_no_subject'` \| `'failed_no_smtp'` \| `'failed_queue_err'` |
| `created_at` | `timestamptz` | NO | `now()` | — |
| `updated_at` | `timestamptz` | NO | `now()` | Auto-updated via trigger |

### Unique Constraint
- `(campaign_id, lead_id)` — one entry per lead per campaign

### Indexes
- `idx_campaign_leads_campaign_id` on `campaign_id`
- `idx_campaign_leads_next_run` on `(status, next_run_at)`

### Trigger
- `trg_campaign_leads_updated_at` → auto-sets `updated_at` on update

---

## 4. `smart_campaigns`

> **Instant/Blast Campaigns** — Single-step campaigns (no drip sequence). SMTP credentials are snapshotted at creation time.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` / `bigint` | NO | auto | Primary key |
| `user_id` | `text` | NO | — | Clerk user ID |
| `campaign_name` | `text` | NO | — | Display name |
| `theme_id` | `text` | YES | — | Email theme template ID |
| `subject_text` | `text` | YES | — | Email subject line |
| `body_text` | `text` | YES | — | HTML email body |
| `smtp_host` | `text` | YES | — | Locked SMTP host |
| `smtp_port` | `text` | YES | — | Locked SMTP port |
| `smtp_user` | `text` | YES | — | Locked SMTP user |
| `smtp_pass` | `text` | YES | — | Locked SMTP password |
| `status` | `text` | YES | — | e.g. `'Completed'` after cleanup |
| `created_at` | `timestamptz` | YES | `now()` | — |

### Key Relationships
- Referenced by: `smart_email_queue.campaign_id` (relational join used in cron)

---

## 5. `smart_email_queue`

> **CRITICAL TABLE** — The send queue for **both** Smart Campaigns and Drip Campaigns.  
> Each row = one email to be sent. Processed by cron jobs.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` / `bigint` | NO | auto | Primary key |
| `campaign_id` | `uuid` / `bigint` | YES | — | FK → `smart_campaigns.id` |
| `user_id` | `text` | NO | — | Clerk user ID |
| `lead_id` | `bigint` / `uuid` | YES | — | FK → `leads.id` |
| `lead_email` | `text` | NO | — | Target email address |
| `business_name` | `text` | YES | — | Denormalized for personalization |
| `city` | `text` | YES | — | Denormalized for personalization |
| `website` | `text` | YES | — | Denormalized for personalization |
| `status` | `text` | NO | `'Pending'` | `'Pending'` \| `'Sent'` \| `'Opened'` \| `'Failed'` |
| `subject_text` | `text` | YES | — | Snapshotted subject (added via migration) |
| `html_body` | `text` | YES | — | Snapshotted HTML body |
| `theme_id` | `text` | YES | — | Snapshotted theme ID |
| `smtp_host` | `text` | YES | — | Snapshotted SMTP host |
| `smtp_port` | `text` | YES | — | Snapshotted SMTP port |
| `smtp_user` | `text` | YES | — | Snapshotted SMTP user |
| `smtp_pass` | `text` | YES | — | Snapshotted SMTP pass |
| `source_type` | `text` | YES | — | `'campaign'` (or other origin types) |
| `sequence_step` | `integer` | YES | — | Which step in a drip sequence |
| `sent_at` | `timestamptz` | YES | `null` | When email was actually sent |
| `opened_at` | `timestamptz` | YES | `null` | When tracking pixel detected open |
| `created_at` | `timestamptz` | YES | `now()` | — |

### Key Relationships
- `campaign_id` → `smart_campaigns.id`
- `lead_id` → `leads.id`
- `user_id` → Clerk User

---

## 6. `user_usage`

> **Per-user usage tracking and billing**. One row per user. Auto-created on first access.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `user_id` | `text` | NO | — | **Primary key** (Clerk user ID) |
| `email` | `text` | YES | `null` | User's email (from Clerk, cached) |
| `plan_type` | `text` | NO | `'free'` | `'free'` \| `'pro'` |
| `leads_saved` | `integer` | NO | `0` | Leads generated this cycle |
| `emails_sent` | `integer` | NO | `0` | Emails sent this cycle |
| `ai_rewrites` | `integer` | NO | `0` | AI rewrite usage this cycle |
| `unsubscriber_views` | `integer` | NO | `0` | Unsubscriber analytics views |
| `cycle_start` | `timestamptz` | NO | — | Billing cycle start |
| `cycle_end` | `timestamptz` | NO | — | Billing cycle end |
| `daily_emails_sent` | `integer` | NO | `0` | Emails sent today |
| `last_email_date` | `text` / `date` | YES | `null` | Date string of last email (e.g. `'2026-04-11'`) |
| `custom_daily_email_limit` | `integer` | YES | `null` | Admin override for daily cap |
| `custom_monthly_email_limit` | `integer` | YES | `null` | Admin override for monthly cap |
| `monthly_emails_sent` | `integer` | YES | — | (Possibly computed/alias column) |
| `updated_at` | `timestamptz` | YES | — | Last modification |

### Plan Limits (Application Logic)
| Plan | Leads | Emails/Month | Daily Email Cap | AI Rewrites | Smart Sequences |
|---|---|---|---|---|---|
| FREE | 60 | 50 | 50 | 10 | ❌ |
| PRO | 2,500 | 2,500 | 125 | ∞ | ✅ |

---

## 7. `user_settings`

> **Per-user SMTP configuration and admin flags**. One row per user.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `user_id` | `text` | NO | — | **Primary key** (Clerk user ID, unique) |
| `smtp_user` | `text` | YES | `null` | Gmail email address |
| `smtp_pass` | `text` | YES | `null` | Gmail App Password |
| `custom_smtp_user` | `text` | YES | `null` | Custom SMTP username |
| `custom_smtp_pass` | `text` | YES | `null` | Custom SMTP password |
| `smtp_host` | `text` | YES | `null` | Custom SMTP host |
| `smtp_port` | `text` | YES | `null` | Custom SMTP port |
| `primary_smtp` | `text` | YES | `null` | `'gmail'` or `'custom'` |
| `plan_type` | `text` | NO | `'free'` | `'free'` \| `'pro'` (CHECK constraint) |
| `is_admin` | `boolean` | NO | `false` | Admin flag |
| `updated_at` | `timestamptz` | YES | — | Last modification |

### Upsert Conflict
- `onConflict: 'user_id'`

---

## 8. `tech_data`

> **Technology stack cache** — Stores detected tech stack per domain to avoid re-scanning.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `domain` | `text` | NO | — | **Primary key** (root domain, e.g. `example.com`) |
| `tech_stack` | `jsonb` | YES | — | Full tech detection result |
| `created_at` | `timestamptz` | YES | — | When detected |

### `tech_stack` JSONB Structure
```json
{
  "wordpress": false,
  "shopify": true,
  "webflow": false,
  "wix": false,
  "woocommerce": false,
  "magento": false,
  "facebookPixel": false,
  "googleAnalytics": true,
  "tiktokPixel": false,
  "linkedinInsights": false,
  "stripe": true,
  "paypal": false,
  "razorpay": false,
  "yoast": false,
  "rankMath": false,
  "hasSSL": true
}
```

### Upsert Behavior
- Upserted on `domain` key

---

## 9. `archive_index`

> **Cold storage lookup index** — Maps domains to archived lead data in the `lead-archives` storage bucket.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` / `bigint` | NO | auto | Primary key |
| `domain` | `text` | NO | — | Normalized domain (e.g. `example.com`) |
| `category` | `text` | YES | — | Original search category |
| `storage_path` | `text` | NO | — | Filename in `lead-archives` bucket |
| `archived_at` | `timestamptz` | YES | — | When the lead was archived |

---

## 10. `system_settings`

> **Singleton table** (constrained to `id = 1`). Global app configuration.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `serial` | NO | — | PK, constrained to `1` |
| `google_api_monthly_usage` | `integer` | NO | `0` | Current month's Google API calls |
| `google_api_alert_limit` | `integer` | YES | — | Warning threshold |
| `google_api_hard_limit` | `integer` | YES | — | Auto-block threshold |
| `is_google_api_blocked` | `boolean` | NO | `false` | Manual/auto block flag |
| `telegram_bot_token` | `text` | YES | — | Telegram bot token for alerts |
| `telegram_chat_id` | `text` | YES | — | Telegram chat ID for alerts |
| `last_reset_date` | `timestamptz` | NO | `now()` | Last API usage reset date |
| `updated_at` | `timestamptz` | YES | `now()` | Auto-updated via trigger |

### RLS
- Authenticated users can SELECT (read-only)
- Updates via service role only

### Trigger
- `update_system_settings_updated_at_trigger` → auto-updates `updated_at`

---

## 11. `admin_audit_logs`

> Tracks all admin actions for audit/compliance.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `admin_id` | `text` | NO | — | Clerk user ID of admin |
| `target_user_id` | `text` | NO | — | Clerk user ID of affected user |
| `action_type` | `text` | NO | — | e.g. `'plan_update'`, `'daily_usage_reset'`, `'manual_payment_approved'` |
| `previous_value` | `jsonb` | YES | — | State before action |
| `new_value` | `jsonb` | YES | — | State after action |
| `created_at` | `timestamptz` | NO | `now()` | — |

### Indexes
- `idx_admin_audit_logs_admin_id`
- `idx_admin_audit_logs_target_user_id`
- `idx_admin_audit_logs_created_at` (DESC)

---

## 12. `support_tickets`

> User-submitted support tickets with admin reply capability.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `user_id` | `text` | NO | — | Clerk user ID |
| `category` | `text` | NO | — | `'payment_issue'` \| `'bug_report'` \| `'feature_request'` \| `'general_inquiry'` |
| `subject` | `text` | NO | — | Max 200 chars (CHECK constraint) |
| `message` | `text` | NO | — | Ticket body |
| `status` | `text` | NO | `'open'` | `'open'` \| `'in_progress'` \| `'resolved'` \| `'closed'` |
| `admin_reply` | `text` | YES | — | Admin's response (added via migration) |
| `created_at` | `timestamptz` | NO | `now()` | — |

### Indexes
- `idx_support_tickets_user_id`
- `idx_support_tickets_status`
- `idx_support_tickets_created_at` (DESC)

### RLS Policies
- **Insert**: own user only (`auth.uid()::text = user_id`)
- **Select**: own user OR admins (via `user_settings.is_admin`)
- **Update**: admins only

---

## 13. `manual_payment_requests`

> Tracks manual payment submissions (UPI, Crypto, PayPal) for Pro plan upgrades.

| Column | Data Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `user_id` | `text` | NO | — | Clerk user ID |
| `email` | `text` | NO | — | User's email |
| `payment_method` | `text` | NO | — | `'upi'` \| `'crypto'` \| `'paypal'` |
| `sender_details` | `text` | NO | — | Payment sender info |
| `transaction_id` | `text` | NO | — | UTR / transaction reference |
| `status` | `text` | NO | `'pending'` | `'pending'` \| `'approved'` \| `'rejected'` |
| `created_at` | `timestamptz` | NO | `now()` | — |

### Indexes
- `idx_manual_payment_requests_user_id`
- `idx_manual_payment_requests_status`
- `idx_manual_payment_requests_created_at` (DESC)

### RLS Policies
- **Insert**: own user only
- **Select**: own user OR admins
- **Update**: admins only

---

## 14. Storage Buckets

### `lead-archives`
- **Purpose**: Cold storage for expired leads (30+ days old)
- **File format**: `{sanitized-domain}.json`
- **Content**: Archived lead data (emails, socials, business info)
- **Used by**: `archive-leads` cron (upload), `scrape` route (download for cache restoration)

### `tech-archives`
- **Purpose**: Cold storage for tech stack scan results
- **File format**: `{domain}.json`
- **Content**: Tech stack JSONB data
- **Used by**: `archive-tech` cron (upload), `detect-tech` route (download for cache restoration)

---

## 15. RPC Functions

### `increment_google_api_usage()`
```sql
-- Atomically increments google_api_monthly_usage by 1
UPDATE system_settings
SET google_api_monthly_usage = google_api_monthly_usage + 1
WHERE id = 1;
```

### `set_updated_at_timestamp()` (Trigger Function)
```sql
-- Auto-sets updated_at = now() on campaign_leads updates
```

---

## 16. Entity Relationship Diagram

```
┌──────────────────────────┐
│      Clerk Auth          │
│  (External - user_id)    │
└────────┬─────────────────┘
         │ user_id (text)
         │
    ┌────┴────────────────────────────────────────────────────┐
    │                                                         │
    ▼                                                         ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐
│  user_usage  │    │user_settings │    │  manual_payment_     │
│              │    │              │    │  requests            │
│ user_id (PK) │    │ user_id (PK) │    │ user_id              │
│ plan_type    │    │ smtp_user    │    │ payment_method       │
│ leads_saved  │    │ smtp_pass    │    │ status               │
│ emails_sent  │    │ is_admin     │    └──────────────────────┘
│ daily_emails │    │ plan_type    │
│ ...          │    └──────────────┘
└──────────────┘
         │
         │ user_id
         ▼
┌──────────────────────────┐         ┌────────────────────────┐
│         leads            │◄────────│    archive_index       │
│                          │ domain  │                        │
│ id (PK, bigint)          │         │ domain                 │
│ user_id                  │         │ storage_path           │
│ business_name            │         │ archived_at            │
│ category (= folder)      │         └────────────────────────┘
│ email, phone, website    │
│ google_place_id          │         ┌────────────────────────┐
│ facebook, instagram...   │         │      tech_data         │
│ is_unsubscribed          │         │                        │
│ mx_valid, has_pixel...   │         │ domain (PK)            │
│ opened_at                │         │ tech_stack (jsonb)     │
│ created_at               │         └────────────────────────┘
└─────────┬───────┬────────┘
          │       │
     lead_id  lead_id
          │       │
          ▼       ▼
┌─────────────────┐    ┌──────────────────────────┐
│ campaign_leads  │    │   smart_email_queue       │
│                 │    │                            │
│ campaign_id ────┼──┐ │ campaign_id ───────────┐  │
│ lead_id         │  │ │ user_id                │  │
│ current_step    │  │ │ lead_id                │  │
│ next_run_at     │  │ │ lead_email             │  │
│ status          │  │ │ status (Pending/Sent)  │  │
└─────────────────┘  │ │ sent_at, opened_at     │  │
                     │ │ smtp_host/user/pass    │  │
                     │ └──────────┬─────────────┘  │
                     │            │                 │
                     ▼            ▼                 │
              ┌──────────┐  ┌──────────────┐       │
              │campaigns │  │smart_campaigns│◄──────┘
              │          │  │              │
              │ user_id  │  │ user_id      │
              │ name     │  │ campaign_name│
              │ sequence │  │ theme_id     │
              │ status   │  │ smtp_*       │
              │ smtp_*   │  │ status       │
              └──────────┘  └──────────────┘

┌──────────────────────────┐    ┌──────────────────────────┐
│    support_tickets       │    │   admin_audit_logs       │
│                          │    │                          │
│ user_id                  │    │ admin_id                 │
│ category, subject        │    │ target_user_id           │
│ message, status          │    │ action_type              │
│ admin_reply              │    │ previous_value (jsonb)   │
└──────────────────────────┘    │ new_value (jsonb)        │
                                └──────────────────────────┘

┌──────────────────────────┐
│   system_settings        │
│   (Singleton, id=1)      │
│                          │
│ google_api_monthly_usage │
│ google_api_hard_limit    │
│ is_google_api_blocked    │
│ telegram_bot_token       │
│ telegram_chat_id         │
└──────────────────────────┘
```

---

## Quick Reference: How User Data Flows

```
1. SEARCH:  Google Places API → upsert into `leads` (user_id, google_place_id, business_name, category, ...)
2. SCRAPE:  `/api/scrape` → update `leads` with email, socials, pixel/seo flags
3. VERIFY:  `/api/verify-mx` → update `leads.mx_valid`
4. TECH:    `/api/detect-tech` → upsert into `tech_data` (domain, tech_stack jsonb)
5. SEND:    `/api/email/send` → update `leads.email_status`, `leads.last_contacted_at`
6. SMART:   `createSmartCampaign()` → insert into `smart_campaigns` + `smart_email_queue`
7. DRIP:    `/api/campaigns/launch` → insert into `campaigns` + `campaign_leads`
8. CRON:    `send-emails` cron → process `smart_email_queue` (Pending → Sent)
9. CRON:    `worker` cron → process `campaign_leads` (drip sequence steps)
10. TRACK:  `/api/track` → update `smart_email_queue.opened_at` + `leads.opened_at`
11. UNSUB:  `/unsubscribe/[lead_id]` → update `leads.is_unsubscribed = true`
12. ARCHIVE: `archive-leads` cron → upload to `lead-archives` bucket + insert `archive_index` + delete from `leads`
```

---

> **Note for Desktop App**: All tables use `user_id` (Clerk ID string) as the tenant key. To query a specific user's data, always filter with `.eq('user_id', clerkUserId)`. The Supabase service role key bypasses RLS, so use it for your desktop app's backend.
