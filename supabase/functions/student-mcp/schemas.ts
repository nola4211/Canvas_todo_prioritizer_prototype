import { z } from 'zod'

const uuid = z.string().uuid()
const assignmentId = z.string().regex(/^\d{1,18}$/)
const dateTime = z.string().datetime({ offset: true })
const limit = z.number().int().min(1).max(100).default(25)
const empty = z.object({}).strict()

export const schemas = {
  get_workspace_context: empty,
  list_assignments: z.object({
    completion_filter:z.enum(['incomplete','complete','all']).default('incomplete'),
    due_from:dateTime.optional(),due_to:dateTime.optional(),list_id:uuid.optional(),
    cursor:z.string().regex(/^\d{1,18}$/).nullable().optional(),limit,
  }).strict().refine(v=>!v.due_from||!v.due_to||Date.parse(v.due_from)<=Date.parse(v.due_to)),
  get_assignment: z.object({assignment_id:assignmentId}).strict(),
  list_lists: z.object({cursor:uuid.nullable().optional(),limit}).strict(),
  get_priority_rules: z.object({scope:z.enum(['settings','main','classes','list']),list_id:uuid.optional()})
    .strict().refine(v=>v.scope==='list'?!!v.list_id:v.list_id===undefined),
  create_assignment: z.object({
    title:z.string().trim().min(1).max(200),class_name:z.string().trim().min(1).max(100),
    due_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),estimated_minutes:z.number().int().min(1).max(10080),
    optional:z.boolean(),grade_weight_percent:z.number().finite().min(0).max(100).nullable(),
    description:z.string().max(2000).nullable().optional(),request_id:uuid,confirm_long:z.boolean().default(false),
  }).strict(),
  set_assignment_completion: z.object({assignment_id:assignmentId,expected_completed:z.boolean(),completed:z.boolean()}).strict(),
  list_study_sessions: z.object({
    start:dateTime,end:dateTime,cursor:z.string().max(256).nullable().optional(),limit,include_cancelled:z.boolean().default(false),
  }).strict().refine(v=>Date.parse(v.end)>Date.parse(v.start)&&Date.parse(v.end)-Date.parse(v.start)<=93*86400000),
  save_study_session: z.object({
    action:z.enum(['create','update']),session_id:uuid.optional(),expected_version:z.number().int().min(1).optional(),
    assignment_id:assignmentId,starts_at:dateTime,ends_at:dateTime,timezone:z.string().min(1).max(80),
    request_id:uuid.optional(),allow_after_due:z.boolean().default(false),
  }).strict().refine(v=>Date.parse(v.ends_at)>Date.parse(v.starts_at)&&
    (v.action==='create'?!!v.request_id&&v.session_id===undefined&&v.expected_version===undefined:
      !!v.session_id&&v.expected_version!==undefined&&v.request_id===undefined)),
  cancel_study_session: z.object({session_id:uuid,expected_version:z.number().int().min(1)}).strict(),
}

export type ToolName = keyof typeof schemas
