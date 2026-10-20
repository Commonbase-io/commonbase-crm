# Company, contact, and deal rules

Company is the top tier.

- A contact cannot be saved without a company in the same organization.
- A deal cannot be saved without a company in the same organization and at least one contact who belongs to that same company.
- The database enforces this with `NOT NULL` company ids, composite foreign keys that include `orgId`, a `companyId` on each deal-contact link that must match both the deal and the contact, and a deferred constraint trigger (`enforce_deal_hierarchy`) so the deal and its contact can be inserted in one transaction. The trigger runs as the invoker, so `crm_app` stays under row level security. It also rejects an open deal whose only contact is archived, which closes the race between archiving a contact and creating a deal.
- `enforce_company_archive` is the same kind of deferred invoker trigger. Archiving a company that gained an active contact or deal in the meantime is rejected, and so is saving an active contact or deal onto a company that was archived in the meantime.
- Moving a contact to another company takes a row lock on that contact before the link check, so a deal added at the same moment gets a field error instead of a foreign-key failure. Nothing is left half-written.

## What the product does when a change would break the rule

- **Create or update a deal** with no company, no contact, or a contact from another company: rejected with a field error. Nothing is written.
- **Create or update a contact** with no company: rejected with a field error.
- **Move a contact to another company** while they are linked to any deal, including an archived deal: rejected. Remove them from deals that still have another contact first. Archived deals keep their original company and contacts, so those links are not rewritten.
- **Archive a contact** who is the only person on an open deal: rejected. Add another contact from the same company, or archive the deal, first. Archiving a contact who shares every open deal with someone else is allowed. The link rows stay, so the deal still has its people.
- **Archive a company** that still has an active contact or an active deal: rejected. Archive those contacts and deals first. Companies, contacts, and deals are archived rather than deleted, so foreign keys are not left dangling. Once every contact and deal at the company is archived, the company itself can be archived.
- **CSV contact import** requires a company domain that already belongs to a company in the organization. Rows without one are invalid and are not inserted. Company import is unchanged, because a company does not need a contact.
- **Deal wizard and contact-with-new-company** write every row in one transaction. If a later step fails, the earlier rows roll back.
- **Another organization's ids** are rejected the same way as a missing record (404). A missing record and a forbidden record look the same.

Invalid rows in a local or CI database are removed by `20261020130000_record_hierarchy` before the constraints are added. A seeded database already follows the rules, so that cleanup does not change it. There is no hosted data. That cleanup is not reversible; the migration is forward-only, like the others, and it runs in one transaction so a failure puts the rows back. `20261020143000_hierarchy_races` does not delete or rewrite rows. It only adds the archive triggers, and it refuses to finish if an open deal's only contact is already archived or an archived company still has an active contact or deal.
