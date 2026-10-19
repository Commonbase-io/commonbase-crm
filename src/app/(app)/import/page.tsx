import { ImportWizard } from "@/components/import-wizard";

export default function ImportPage() {
  return (
    <section>
      <div className="page-head">
        <h1>Import</h1>
      </div>
      <p className="muted">Upload a CSV, map the columns, preview row errors, then import. Duplicate emails and domains in this organization are skipped.</p>
      <ImportWizard />
    </section>
  );
}
