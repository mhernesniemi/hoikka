/**
 * The admin sidebar. Reorder, remove or add sections here; /admin opens the
 * first one. Removing an item only hides it: its pages still exist.
 */
import type { Component } from "svelte";
import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
import Tag from "@lucide/svelte/icons/tag";
import FolderOpen from "@lucide/svelte/icons/folder-open";
import Filter from "@lucide/svelte/icons/filter";
import LayoutGrid from "@lucide/svelte/icons/layout-grid";
import Users from "@lucide/svelte/icons/users";
import Star from "@lucide/svelte/icons/star";
import Percent from "@lucide/svelte/icons/percent";
import ImageIcon from "@lucide/svelte/icons/image";
import FileText from "@lucide/svelte/icons/file-text";
import Clock from "@lucide/svelte/icons/clock";

export interface AdminNavItem {
	href: string;
	label: string;
	icon: Component<{ class?: string; strokeWidth?: number }>;
}

export const adminNav: AdminNavItem[] = [
	{ href: "/admin/orders", label: "Orders", icon: ShoppingCart },
	{ href: "/admin/products", label: "Products", icon: Tag },
	{ href: "/admin/collections", label: "Collections", icon: FolderOpen },
	{ href: "/admin/facets", label: "Facets", icon: Filter },
	{ href: "/admin/categories", label: "Categories", icon: LayoutGrid },
	{ href: "/admin/customers", label: "Customers", icon: Users },
	{ href: "/admin/reviews", label: "Reviews", icon: Star },
	{ href: "/admin/promotions", label: "Promotions", icon: Percent },
	{ href: "/admin/assets", label: "Assets", icon: ImageIcon },
	{ href: "/admin/content-pages", label: "Pages", icon: FileText },
	{ href: "/admin/tasks", label: "Tasks", icon: Clock }
];
