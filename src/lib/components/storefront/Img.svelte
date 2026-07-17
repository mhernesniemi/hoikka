<script lang="ts">
  /**
   * Optimized image for uploaded assets. Emits src + 1x/2x srcset against the
   * resizing /uploads route (sharp on node, Cloudflare Images on cloudflare),
   * lazy-loads by default, and positions the crop on the focal point.
   *
   *   <Img src={asset.source} alt={name} width={400} class="h-full w-full object-cover" />
   */
  import { imageUrl, imageSrcset, focalPosition } from "$lib/image";

  let {
    src,
    alt = "",
    width,
    quality = 80,
    sizes,
    focalX,
    focalY,
    loading = "lazy",
    fetchpriority = "auto",
    class: className = ""
  }: {
    src: string;
    alt?: string;
    /** Display width in px — served at 1x and 2x */
    width: number;
    quality?: number;
    sizes?: string;
    focalX?: number | null;
    focalY?: number | null;
    loading?: "lazy" | "eager";
    fetchpriority?: "high" | "low" | "auto";
    class?: string;
  } = $props();
</script>

<img
  src={imageUrl(src, width, quality)}
  srcset={imageSrcset(src, width, quality)}
  sizes={sizes ?? `${width}px`}
  {alt}
  {loading}
  {fetchpriority}
  decoding="async"
  class={className}
  style="object-position: {focalPosition(focalX, focalY)}"
/>
