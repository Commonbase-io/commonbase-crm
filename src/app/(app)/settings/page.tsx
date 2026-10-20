import { requireSession } from "@/lib/auth/current";
import { getPipeline } from "@/lib/crm/pipelines";
import { listUsers } from "@/lib/crm/users";
import { StagesPanel } from "@/components/stages-panel";
import { UsersPanel } from "@/components/users-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  const { tab } = await searchParams;
  const [pipeline, users] = await Promise.all([getPipeline(session), listUsers(session, true)]);
  const defaultTab = tab === "users" ? "users" : "pipeline";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <h1 className="page-heading">Settings</h1>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline">
          <StagesPanel stages={pipeline.stages} />
        </TabsContent>
        <TabsContent value="users">
          <UsersPanel users={users} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
