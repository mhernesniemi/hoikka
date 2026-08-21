<script lang="ts">
  /**
   * Product image gallery: hero + thumbnail strip. Warms the non-hero
   * images at hero size once the browser is idle, so switching is instant.
   */
  import { browser } from "$app/environment";
  import { cn } from "@hoikka/core/shared/utils";
  import Img from "$lib/components/storefront/Img.svelte";
  import { HERO_SIZES, HERO_WIDTH, warmGalleryImages } from "@hoikka/core/shared/product-images";
  import ImageIcon from "@lucide/svelte/icons/image";
  import type { ProductWithRelations } from "@hoikka/core/shared/types";

  type GalleryImage = ProductWithRelations["assets"][number];

  let {
    images,
    selectedIndex = $bindable(0),
    alt,
    onSelectImage
  }: {
    images: GalleryImage[];
    selectedIndex?: number;
    alt: string;
    /** Fired when a thumbnail is chosen (e.g. to sync the variant picker) */
    onSelectImage?: (image: GalleryImage) => void;
  } = $props();

  $effect(() => {
    if (!browser || images.length < 2) return;
    return warmGalleryImages(images);
  });
</script>

<div>
  <!-- Main Image -->
  <div class="aspect-square overflow-hidden rounded-lg bg-gray-100">
    {#if images.length > 0}
      {@const currentImage = images[selectedIndex]}
      <Img
        src={currentImage.source}
        {alt}
        width={HERO_WIDTH}
        sizes={HERO_SIZES}
        loading="eager"
        fetchpriority="high"
        focalX={currentImage.focalX}
        focalY={currentImage.focalY}
        class="h-full w-full object-cover"
      />
    {:else}
      <div class="flex h-full w-full items-center justify-center text-gray-400">
        <ImageIcon class="h-24 w-24" />
      </div>
    {/if}
  </div>

  <!-- Thumbnails -->
  {#if images.length > 1}
    <div class="mt-4 mb-6 flex gap-2 overflow-x-auto lg:mb-0">
      {#each images as image, index}
        <button
          type="button"
          onclick={() => {
            selectedIndex = index;
            onSelectImage?.(image);
          }}
          class={cn(
            "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
            selectedIndex === index ? "border-blue-500" : "border-transparent hover:border-gray-300"
          )}
        >
          <Img
            src={image.source}
            alt=""
            width={100}
            focalX={image.focalX}
            focalY={image.focalY}
            class="h-full w-full object-cover"
          />
        </button>
      {/each}
    </div>
  {/if}
</div>
