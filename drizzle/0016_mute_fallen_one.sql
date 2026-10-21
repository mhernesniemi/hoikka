CREATE TABLE `task_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`summary` text,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `task_runs_task_idx` ON `task_runs` (`task`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_runs_running_idx` ON `task_runs` (`task`) WHERE status = 'running';