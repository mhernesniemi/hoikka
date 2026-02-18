<script lang="ts">
  import { cn } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import Crosshair from "@lucide/svelte/icons/crosshair";

  interface Props {
    src: string;
    focalX: number;
    focalY: number;
    onchange: (x: number, y: number) => void;
  }

  let { src, focalX, focalY, onchange }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let isDragging = $state(false);

  function updateFromEvent(e: MouseEvent) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onchange(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
  }

  function handlePointerDown(e: MouseEvent) {
    isDragging = true;
    updateFromEvent(e);
  }

  function handlePointerMove(e: MouseEvent) {
    if (isDragging) updateFromEvent(e);
  }

  function handlePointerUp() {
    isDragging = false;
  }
</script>

<svelte:window onpointermove={handlePointerMove} onpointerup={handlePointerUp} />

<div class="overflow-hidden rounded-lg bg-surface shadow">
  <div class="flex items-center gap-2 border-b border-border px-4 py-3">
    <Crosshair class="h-4 w-4 text-muted-foreground" />
    <h2 class="font-semibold">Focal Point</h2>
    <span class="ml-auto text-xs text-muted-foreground">
      {Math.round(focalX * 100)}%, {Math.round(focalY * 100)}%
    </span>
  </div>
  <div class="p-4">
    <div
      bind:this={container}
      role="button"
      tabindex="0"
      class={cn(
        "relative mx-auto overflow-hidden rounded select-none",
        isDragging ? "cursor-crosshair" : "cursor-crosshair"
      )}
      onpointerdown={handlePointerDown}
    >
      <img
        src={imageUrl(src, 800)}
        alt="Focal point preview"
        class="block w-full"
        draggable="false"
      />
      <!-- Crosshair overlay -->
      <div
        class="pointer-events-none absolute h-0 w-0"
        style="left: {focalX * 100}%; top: {focalY * 100}%;"
      >
        <!-- Horizontal line -->
        <div class="absolute top-0 left-[-9999px] h-px w-[19998px] bg-white/50"></div>
        <!-- Vertical line -->
        <div class="absolute top-[-9999px] left-0 h-[19998px] w-px bg-white/50"></div>
        <!-- Center dot -->
        <div
          class="absolute -top-3 -left-3 h-6 w-6 rounded-full border-2 border-white bg-blue-500/80 shadow-md"
        ></div>
      </div>
    </div>
    <p class="mt-2 text-xs text-muted-foreground">
      Click or drag on the image to set the focal point. This determines how the image is cropped at
      different aspect ratios.
    </p>
  </div>
</div>
