# Analysis
- Keep standard and net analysis on their existing model and request contract; free-form questions use an isolated handler so historical evidence does not change existing summaries.
- Build question evidence with a service-role-only, security-invoker aggregate RPC and paginate its results; SQL owns UTC bucketing and weighted metrics to avoid raw-history downloads.
- Resolve hubs from active directory profiles, normalize callsign SSIDs, and use coordinate-derived nearest peers; do not invent geographic cohorts or seasonal causes.
- Stream question answers as NDJSON text/error/done events while preserving the existing JSON response for standard analysis.- Every SMS goes through `supabase/functions/_shared/twilio.ts` `sendSms`, which checks the `sms_sending_enabled` setting and logs to `sms_log`; why: one gate for carrier-compliance and auditable sends.
