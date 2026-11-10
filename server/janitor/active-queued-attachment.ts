import { sql, type SQL } from "drizzle-orm";

/** Failed queue entries remain editable/retryable and still own their attachments. */
export function activeQueuedAttachmentReference(attachmentId: SQL, workspaceId: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM chat_queued_messages AS queued_attachment
    WHERE queued_attachment.workspace_id = ${workspaceId}
      AND queued_attachment.status IN ('queued', 'dispatching', 'failed')
      AND queued_attachment.input->'attachmentIds' ? ${attachmentId}
  )`;
}
