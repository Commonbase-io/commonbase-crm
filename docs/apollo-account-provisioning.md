# Apollo account provisioning runbook (manual)

Every client tenant gets its **own dedicated** Apollo account. Never share accounts, credentials, seats, credits, mailboxes, sequences, or lists between tenants.

> Blocked: don't start live provisioning until the global gates in `apollo-integration-gates.md` are met. Steps that depend on Apollo product details are marked **(verify in current Apollo docs)**.

## 1. Account creation
1. Confirm the client contract covers outbound on their behalf and data handling.
2. Decide the **account holder** (client or Commonbase). Client-held is preferred.
3. Create the Apollo account using a tenant-specific admin address (not a personal or shared inbox).
4. Record `external_account_id` and `account_holder`.

## 2. Ownership and billing
1. Decide the **billing party** (client or Commonbase) and record it as `billing_party`.
2. Record the plan in `plan_tier`.
3. Store the client's written authorization. Set `authorization_confirmed_at` to the date received.

## 3. Plan selection
Pick the plan with enough credits and sequence/mailbox capacity for the agreed volume. **(Verify plan limits and credit costs in current Apollo docs.)**

## 4. Mailbox and sending domain
1. Use a client-approved sending domain, ideally a dedicated subdomain.
2. Configure SPF, DKIM, and DMARC, and verify alignment.
3. Connect mailboxes in Apollo. **(Verify the supported mailbox connection method.)**
4. Set per-mailbox daily limits. Mirror them in `mailboxes.daily_limit`.

## 5. Warmup
Ramp volume gradually over weeks before enrolling real prospects. Don't activate campaigns on cold mailboxes.

## 6. Credential capture
1. Create the credential the docs permit for this setup (per-account OAuth or per-account API key). **(Verify.)**
2. Store it in Supabase Vault under `tenant/<tenant_id>/connection/<connection_id>`. Never in env files, tickets, chat, or logs.
3. Set `credential_ref = vault:tenant/<tenant_id>/connection/<connection_id>`.

## 7. Connection test
1. Run the connection health check (to be built with the live adapter).
2. On success: `status = connected`, `last_verified_at = now()`.
3. On failure: `status = error`, `last_error` set. It shows on the Integrations page.
4. Only then set `mode = live`.

## 8. Offboarding
1. Stop all active sequences. Set campaigns to `paused` or `completed`.
2. Revoke the credential in Apollo and delete it from Vault. Set `status = revoked`, `credential_ref = null`.
3. Run a final opt-out sync so no unsubscribes are lost.
4. Export or delete provider-mapped data per Apollo's retention terms and the client contract. **(Verify retention terms.)**
5. Record each step in `audit_logs`.
