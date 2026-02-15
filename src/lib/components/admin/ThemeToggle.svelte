<script lang="ts">
  import { getTheme, setTheme, type Theme } from "$lib/stores/admin-theme.svelte";
  import { cn } from "$lib/utils";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";

  const options: { value: Theme; icon: typeof Monitor; label: string }[] = [
    { value: "system", icon: Monitor, label: "System" },
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" }
  ];
</script>

<div class="flex gap-1 rounded-lg bg-gray-800 p-1" role="radiogroup" aria-label="Theme">
  {#each options as opt}
    <button
      type="button"
      role="radio"
      aria-checked={getTheme() === opt.value}
      aria-label={opt.label}
      onclick={() => setTheme(opt.value)}
      class={cn(
        "rounded-md p-1.5 transition-colors",
        getTheme() === opt.value ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
      )}
    >
      <opt.icon class="h-3.5 w-3.5" />
    </button>
  {/each}
</div>
