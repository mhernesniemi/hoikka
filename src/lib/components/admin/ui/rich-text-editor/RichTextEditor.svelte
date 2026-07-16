<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Link from "@tiptap/extension-link";
  import Placeholder from "@tiptap/extension-placeholder";
  import { cn } from "$lib/utils.js";

  interface Props {
    content?: string;
    placeholder?: string;
    name?: string;
    form?: string;
    class?: string;
    onchange?: (html: string) => void;
  }

  let {
    content = "",
    placeholder = "Write something...",
    name,
    form: formId,
    class: className,
    onchange
  }: Props = $props();

  let element: HTMLDivElement;
  let editor: Editor | undefined = $state();
  let html = $state(content);
  let editorVersion = $state(0);

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [2, 3]
          }
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-blue-600 dark:text-blue-400 underline"
          }
        }),
        Placeholder.configure({
          placeholder
        })
      ],
      content,
      editorProps: {
        attributes: {
          class: "prose prose-base max-w-none focus:outline-none min-h-[100px] px-3 py-2"
        }
      },
      onTransaction: () => {
        editorVersion++;
      },
      onUpdate: ({ editor }) => {
        html = editor.getHTML();
        onchange?.(html);
      }
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });

  function toggleBold() {
    editor?.chain().focus().toggleBold().run();
  }

  function toggleItalic() {
    editor?.chain().focus().toggleItalic().run();
  }

  function toggleHeading(level: 2 | 3) {
    editor?.chain().focus().toggleHeading({ level }).run();
  }

  function toggleBulletList() {
    editor?.chain().focus().toggleBulletList().run();
  }

  function toggleOrderedList() {
    editor?.chain().focus().toggleOrderedList().run();
  }

  function setLink() {
    const previousUrl = editor?.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) return;

    if (url === "") {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function unsetLink() {
    editor?.chain().focus().unsetLink().run();
  }

  function isActive(name: string, attrs?: Record<string, unknown>): boolean {
    // Reference editorVersion to create reactivity on every transaction
    void editorVersion;
    return editor?.isActive(name, attrs) ?? false;
  }
</script>

<div
  class={cn(
    "overflow-hidden rounded-lg border border-input-border bg-surface focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 hover:border-input-border-hover",
    className
  )}
>
  <!-- Toolbar -->
  <div class="flex flex-wrap gap-1 border-b border-input-border px-2 py-1.5">
    <button
      type="button"
      onclick={toggleBold}
      class={cn(
        "rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-muted-strong",
        isActive("bold") && "bg-muted-strong"
      )}
      title="Bold"
    >
      B
    </button>

    <button
      type="button"
      onclick={toggleItalic}
      class={cn(
        "rounded px-2 py-1 text-sm italic transition-colors hover:bg-muted-strong",
        isActive("italic") && "bg-muted-strong"
      )}
      title="Italic"
    >
      I
    </button>

    <span class="mx-1 w-px bg-input-border"></span>

    <button
      type="button"
      onclick={() => toggleHeading(2)}
      class={cn(
        "rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-muted-strong",
        isActive("heading", { level: 2 }) && "bg-muted-strong"
      )}
      title="Heading 2"
    >
      H2
    </button>

    <button
      type="button"
      onclick={() => toggleHeading(3)}
      class={cn(
        "rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-muted-strong",
        isActive("heading", { level: 3 }) && "bg-muted-strong"
      )}
      title="Heading 3"
    >
      H3
    </button>

    <span class="mx-1 w-px bg-input-border"></span>

    <button
      type="button"
      onclick={toggleBulletList}
      class={cn(
        "rounded px-2 py-1 text-sm transition-colors hover:bg-muted-strong",
        isActive("bulletList") && "bg-muted-strong"
      )}
      title="Bullet List"
    >
      •
    </button>

    <button
      type="button"
      onclick={toggleOrderedList}
      class={cn(
        "rounded px-2 py-1 text-sm transition-colors hover:bg-muted-strong",
        isActive("orderedList") && "bg-muted-strong"
      )}
      title="Numbered List"
    >
      1.
    </button>

    <span class="mx-1 w-px bg-input-border"></span>

    {#if isActive("link")}
      <button
        type="button"
        onclick={unsetLink}
        class="rounded px-2 py-1 text-sm text-red-600 transition-colors hover:bg-destructive-subtle"
        title="Remove Link"
      >
        Unlink
      </button>
    {:else}
      <button
        type="button"
        onclick={setLink}
        class="rounded px-2 py-1 text-sm transition-colors hover:bg-muted-strong"
        title="Add Link"
      >
        Link
      </button>
    {/if}
  </div>

  <!-- Editor content -->
  <div bind:this={element}></div>

  <!-- Hidden input to submit HTML content with form -->
  {#if name}
    <input type="hidden" {name} form={formId} value={html} />
  {/if}
</div>

<style>
  :global(.tiptap p.is-editor-empty:first-child::before) {
    color: #9ca3af;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
</style>
