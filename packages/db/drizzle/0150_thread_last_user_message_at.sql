ALTER TABLE `threads` ADD `last_user_message_at` integer;--> statement-breakpoint
UPDATE `threads`
SET `last_user_message_at` = (
  SELECT MAX(`created_at`) FROM `prompt_history_entries`
  WHERE `prompt_history_entries`.`thread_id` = `threads`.`id`
)
WHERE EXISTS (
  SELECT 1 FROM `prompt_history_entries`
  WHERE `prompt_history_entries`.`thread_id` = `threads`.`id`
);
