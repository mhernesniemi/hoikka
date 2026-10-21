/** Column helpers for the core schema, and for your own tables next to it. */
import { integer } from "drizzle-orm/sqlite-core";

export const pk = () => integer("id").primaryKey({ autoIncrement: true });
export const now = () =>
	integer({ mode: "timestamp_ms" })
		.$defaultFn(() => new Date())
		.notNull();
export const updatedNow = () =>
	integer({ mode: "timestamp_ms" })
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date())
		.notNull();
export const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
export const bool = (name: string) => integer(name, { mode: "boolean" });
