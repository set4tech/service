/**
 * Standard shape for async data state
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Standard hook return shape with state, actions, and computed values
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HookReturn<TState, TActions, TComputed = {}> {
  state: TState;
  actions: TActions;
  computed?: TComputed;
}

/**
 * Common fetch options
 */
export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  retry?: number;
  retryDelay?: number;
}

/**
 * Common persistence options
 */
export interface PersistenceOptions<T> {
  validate?: (value: T) => T;
  debounce?: number;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
}

/**
 * Standard CRUD actions interface
 */
export interface CrudActions<T, TCreate = Partial<T>> {
  create: (item: TCreate) => Promise<T>;
  update: (id: string, item: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Selection state interface
 */
export interface SelectionState<T = string> {
  selectedId: T | null;
  select: (id: T | null) => void;
}
