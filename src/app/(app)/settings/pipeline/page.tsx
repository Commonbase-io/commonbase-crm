import { redirect } from "next/navigation";

export default function PipelineSettingsRedirect() {
  redirect("/settings?tab=pipeline");
}