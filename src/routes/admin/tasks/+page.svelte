<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
  } from "#lib/components/admin/ui/table/index.js";
  import { Badge, type BadgeVariant } from "#lib/components/admin/ui/badge/index.js";
  import { Button } from "#lib/components/admin/ui/button/index.js";
  import AdminCard from "#lib/components/admin/AdminCard.svelte";
  import { formatDateTime } from "#lib/utils.js";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let runningTask = $state<string | null>(null);

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  type Run = PageData["runs"][number];

  const statusVariant: Record<Run["status"], BadgeVariant> = {
    running: "default",
    succeeded: "success",
    failed: "destructive"
  };

  function schedule(minutes: number): string {
    if (minutes % 1440 === 0) return minutes === 1440 ? "Daily" : `Every ${minutes / 1440} days`;
    if (minutes % 60 === 0) return minutes === 60 ? "Hourly" : `Every ${minutes / 60} hours`;
    return `Every ${minutes} min`;
  }

  function duration(run: Run): string {
    if (!run.finishedAt) return "—";
    const seconds = (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000;
    return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds / 60)} min`;
  }

  function summary(run: Run): string {
    if (run.error) return run.error;
    if (!run.summary) return "";
    return Object.entries(run.summary)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
  }
</script>

<svelte:head><title>Tasks | Admin</title></svelte:head>

<div>
  <div class="mb-6">
    <h1 class="text-2xl leading-[40px] font-bold">Tasks</h1>
    <p class="text-sm text-muted-foreground">Recurring background work and its recent runs.</p>
  </div>

  <div class="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each data.tasks as task (task.name)}
      <AdminCard title={task.label} description={schedule(task.everyMinutes)}>
        {#snippet headerActions()}
          <form
            method="POST"
            action="?/run"
            use:enhance={() => {
              runningTask = task.name;
              return async ({ result, update }) => {
                runningTask = null;
                if (result.type === "success") toast.success(`${task.label} finished`);
                await update();
              };
            }}
          >
            <input type="hidden" name="task" value={task.name} />
            <Button type="submit" variant="outline" size="sm" disabled={runningTask === task.name}>
              {runningTask === task.name ? "Running..." : "Run now"}
            </Button>
          </form>
        {/snippet}

        <dl class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-4">
            <dt class="text-muted-foreground">Status</dt>
            <dd>
              {#if task.lastRun}
                <Badge variant={statusVariant[task.lastRun.status]} class="capitalize">
                  {task.lastRun.status}
                </Badge>
              {:else}
                Not run yet
              {/if}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-muted-foreground">Last run</dt>
            <dd>{task.lastRun ? formatDateTime(task.lastRun.startedAt) : "—"}</dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-muted-foreground">Last success</dt>
            <dd class="flex items-center gap-2">
              {#if task.stale}
                <Badge variant="warning">Stale</Badge>
              {/if}
              {task.lastSuccessAt ? formatDateTime(task.lastSuccessAt) : "—"}
            </dd>
          </div>
        </dl>
      </AdminCard>
    {/each}
  </div>

  <AdminCard title="Recent runs" noPadding>
    {#if data.runs.length === 0}
      <div class="p-6">
        <p class="text-sm text-muted-foreground">No runs yet</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <Table class="rounded-none border-0 shadow-none">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="px-4 py-3 text-sm">Task</TableHead>
              <TableHead class="px-4 py-3 text-sm">Started</TableHead>
              <TableHead class="px-4 py-3 text-sm">Trigger</TableHead>
              <TableHead class="px-4 py-3 text-sm">Status</TableHead>
              <TableHead class="px-4 py-3 text-sm">Duration</TableHead>
              <TableHead class="px-4 py-3 text-sm">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.runs as run (run.id)}
              <TableRow>
                <TableCell class="px-4 py-3 text-sm font-medium">
                  {data.tasks.find((task) => task.name === run.task)?.label ?? run.task}
                </TableCell>
                <TableCell class="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground">
                  {formatDateTime(run.startedAt)}
                </TableCell>
                <TableCell class="px-4 py-3 text-sm capitalize">{run.trigger}</TableCell>
                <TableCell class="px-4 py-3 text-sm">
                  <Badge variant={statusVariant[run.status]} class="capitalize">{run.status}</Badge>
                </TableCell>
                <TableCell class="px-4 py-3 text-sm text-muted-foreground"
                  >{duration(run)}</TableCell
                >
                <TableCell class="max-w-md truncate px-4 py-3 text-sm" title={summary(run)}>
                  {summary(run)}
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {/if}
  </AdminCard>
</div>
