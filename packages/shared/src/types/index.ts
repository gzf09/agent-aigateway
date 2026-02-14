// ===== Agent Response Types =====
export type AgentResponseChunk =
  | { type: 'text'; content: string }
  | { type: 'clarification'; question: ClarifyQuestion }
  | { type: 'predictive_form'; form: PredictiveForm }
  | { type: 'confirm_card'; card: ConfirmCard }
  | { type: 'tool_start'; toolName: string }
  | { type: 'tool_result'; result: ToolCallResult }
  | { type: 'rollback_hint'; snapshotId: string; versionId: number }
  | { type: 'dashboard_event'; event: DashboardEvent }
  | { type: 'error'; error: AgentError };

// ===== Confirm Cards =====
export type ConfirmCard = SummaryCard | DiffCard | NameInputCard;

export interface SummaryCard {
  type: 'summary';
  riskLevel: 'low';
  title: string;
  resourceType: string;
  resourceName: string;
  fields: { label: string; value: string }[];
}

export interface DiffCard {
  type: 'diff';
  riskLevel: 'medium' | 'high';
  title: string;
  resourceType: string;
  resourceName: string;
  changes: DiffChange[];
  warnings?: string[];
}

export interface DiffChange {
  field: string;
  oldValue: string;
  newValue: string;
  changeType: 'added' | 'removed' | 'modified';
}

export interface NameInputCard {
  type: 'name_input';
  riskLevel: 'high';
  title: string;
  resourceType: string;
  resourceName: string;
  impactDescription: string;
  warnings: string[];
}

// ===== Predictive Form =====
export interface PredictiveForm {
  title: string;
  targetTool: string;
  fields: PredictiveFormField[];
  inferenceNotes?: string;
}

export interface PredictiveFormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'multi-select' | 'toggle' | 'group';
  value: unknown | null;
  required: boolean;
  inferred: boolean;
  options?: { label: string; value: string }[];
  children?: PredictiveFormField[];
  validation?: { min?: number; max?: number; pattern?: string; message?: string };
}

// ===== Clarification =====
export interface ClarifyQuestion {
  question: string;
  options?: { label: string; value: string }[];
}

// ===== ChangeLog =====
export interface ChangeLogEntry {
  id: string;
  sessionId: string;
  versionId: number;
  operationType: 'create' | 'update' | 'delete';
  resourceType: ResourceType;
  resourceName: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  changeSummary: string;
  createdAt: number;
  rollbackStatus: 'active' | 'rolled_back' | 'superseded';
  rollbackOf?: number;
}

// ===== Session =====
export interface SessionMetadata {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActiveAt: number;
  mcpConnected: boolean;
  currentVersion: number;
}

// ===== Topology =====
export interface TopologyData {
  routes: TopologyRoute[];
}

export interface TopologyRoute {
  name: string;
  path: string;
  matchType: string;
  upstreams: TopologyUpstream[];
  fallback?: TopologyFallback | null;
}

export interface TopologyUpstream {
  provider: string;
  weight: number;
  models: { from: string; to: string }[];
  healthy: boolean;
}

export interface TopologyFallback {
  enabled: boolean;
  strategy: 'RAND' | 'SEQ';
  upstreams: { provider: string; models: { from: string; to: string }[] }[];
  responseCodes: string[];
}

// ===== WebSocket Protocol =====
export interface ClientMessage {
  type: 'user_message' | 'confirm' | 'cancel' | 'name_confirm' | 'rollback' | 'rollback_to_version' | 'form_submit';
  sessionId: string;
  payload: {
    content?: string;
    targetVersionId?: number;
    confirmedName?: string;
    formData?: Record<string, unknown>;
    targetTool?: string;
  };
}

export interface ServerMessage {
  type: 'agent_text' | 'agent_text_done' | 'confirm_card' | 'predictive_form' | 'clarification'
    | 'tool_status' | 'operation_result' | 'rollback_hint' | 'dashboard_update'
    | 'mcp_connection_status' | 'error';
  sessionId: string;
  payload: unknown;
}

// ===== Tool Call =====
export interface ToolCallResult {
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface PlannedToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

// ===== Resource =====
export type ResourceType = 'ai-provider' | 'ai-route' | 'route' | 'service-source' | 'plugin' | 'mcp-server';

export interface ResourceReference {
  type: ResourceType;
  name: string;
  timestamp: number;
}

// ===== Dashboard Event =====
export interface DashboardEvent {
  eventType: 'provider_changed' | 'route_changed' | 'plugin_changed' | 'operation_added';
  resourceType: ResourceType;
  resourceName?: string;
  action: 'create' | 'update' | 'delete' | 'rollback';
}

// ===== Rollback =====
export interface RollbackResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  stepsRolledBack: number;
  failedAt?: { versionId: number; error: string };
}

// ===== Error =====
export interface AgentError {
  code: string;
  message: string;
  details?: unknown;
}

// ===== Preprocessor =====
export interface PreprocessorResult {
  allowed: boolean;
  riskOverride?: 'medium' | 'high';
  blockReason?: string;
  additionalWarnings?: string[];
}

// ===== Chat Message =====
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    confirmCard?: ConfirmCard;
    predictiveForm?: PredictiveForm;
    clarification?: ClarifyQuestion;
    toolStatus?: { toolName: string; status: 'calling' | 'done' | 'error' };
    operationResult?: { success: boolean; message: string; rollbackVersionId?: number };
  };
}

// ===== AI Provider =====
export interface AIProvider {
  name: string;
  type: string;
  protocol?: string;
  tokens?: string[];
  tokenFailoverConfig?: {
    enabled?: boolean;
    failureThreshold?: number;
    successThreshold?: number;
    healthCheckInterval?: number;
    healthCheckTimeout?: number;
    healthCheckModel?: string;
  };
  version?: string;
}

// ===== AI Route =====
export interface AIRoute {
  name: string;
  version?: string;
  domains?: string[];
  pathPredicate?: { matchType: string; matchValue: string; caseSensitive?: boolean };
  upstreams: AIRouteUpstream[];
  modelPredicates?: { matchType: string; matchValue: string }[];
  authConfig?: Record<string, unknown>;
  fallbackConfig?: {
    enabled: boolean;
    fallbackStrategy?: 'RAND' | 'SEQ';
    upstreams?: AIRouteUpstream[];
    responseCodes?: string[];
  };
}

export interface AIRouteUpstream {
  provider: string;
  weight: number;
  modelMapping?: Record<string, string>;
}

// ===== MCP Tool Definition =====
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
