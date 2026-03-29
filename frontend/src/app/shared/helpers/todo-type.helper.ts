export type TodoType = 'workitem' | 'story' | 'project' | 'task';

export function getTodoType(
    todo: { parent_id?: number | null; subtask_count?: number; type?: TodoType },
    subtasks?: { subtask_count?: number; type?: TodoType; parent_id?: number | null }[],
    parentTodo?: { type?: TodoType; subtask_count?: number; parent_id?: number | null }
): TodoType {
    const hasSubtasks = (todo.subtask_count ?? 0) > 0 || (subtasks && subtasks.length > 0);
    const isChild = !!todo.parent_id;

    // 1. Respect explicit type if it's 'project' or 'story' (strong types)
    if (todo.type === 'project' || todo.type === 'story') {
        return todo.type;
    }

    // 2. Contextual Inference if parent is provided
    if (isChild && parentTodo) {
        // Find parent's type recursively but without subtasks context for the parent 
        // to avoid infinite loops, just use its own explicit or basic type.
        const pType = getTodoType(parentTodo);
        if (pType === 'project') return 'story';
        if (pType === 'story') return 'task';
    }

    // 3. Hierarchy Enforcement for inferred types:
    if (isChild) {
        // If it's explicitly a task, trust it.
        if (todo.type === 'task') return 'task';

        // If it has children itself, it's definitely a Story (nested in a Project).
        // Otherwise, if type is 'task' or unset, it's a Task.
        return hasSubtasks ? 'story' : 'task';
    }

    // 3. Root item fallback inference
    if (!hasSubtasks) {
        return todo.type === 'workitem' ? 'workitem' : (todo.type || 'workitem');
    }

    // Root with subtasks: Project if any child is itself a story (explicitly or inferred)
    if (subtasks && subtasks.some(s => (s.subtask_count ?? 0) > 0 || s.type === 'story')) {
        return 'project';
    }

    return 'story';
}

export function getTodoTypeLabel(type: TodoType): string {
    return { workitem: 'Work Item', story: 'Story', project: 'Project', task: 'Task' }[type];
}

export function getTodoTypeIcon(type: TodoType): string {
    return {
        workitem: 'bi-list-task',
        story:    'bi-journal-bookmark-fill',
        project:  'bi-layers-fill',
        task:     'bi-arrow-return-right',
    }[type];
}

/**
 * Enriches a single todo by inferring its type based on its parent.
 */
export function enrichTodo(todo: any, allTodos?: any[]): any {
    if (!todo) return todo;
    
    // Normalize status
    if (todo.status === 'inprogress') {
        todo.status = 'inProgress';
    }

    // Infer type
    if (todo.parent_id && (todo.type === 'workitem' || !todo.type)) {
        const context = (allTodos && allTodos.length > 0) ? allTodos : [];
        const parent = context.find(t => t.id === todo.parent_id);
        if (parent) {
            const pType = getTodoType(parent);
            if (pType === 'project') todo.type = 'story';
            else if (pType === 'story') todo.type = 'task';
        }
    }
    return todo;
}

/**
 * Recursively flattens a hierarchy of todos into a single array.
 */
export function flattenTodos(todos: any[]): any[] {
    let flat: any[] = [];
    todos.forEach(todo => {
        flat.push(todo);
        if (todo.subtasks && todo.subtasks.length > 0) {
            flat.push(...flattenTodos(todo.subtasks));
        }
    });
    return flat;
}

/**
 * Enriches a list of todos by inferring their types based on their parents.
 * This handles the case where the database might have 'workitem' but it's
 * actually a 'story' or 'task' based on the hierarchy.
 * Also normalizes status casing (e.g., inprogress -> inProgress).
 */
export function enrichTodoTypes(todos: any[], allTodos?: any[]): any[] {
    // Create a combined context for lookups to ensure we find parents regardless of which list they are in
    const context = [...(allTodos || []), ...todos];
    const todoMap = new Map<number, any>();
    
    // Build map, prioritizing already enriched items or more complete objects
    context.forEach(t => {
        if (t && t.id) {
            const existing = todoMap.get(t.id);
            if (!existing || (t.type !== 'workitem' && t.type)) {
                todoMap.set(t.id, t);
            }
        }
    });
    
    return todos.map(todo => {
        // 1. Normalize status
        if (todo.status === 'inprogress') {
            todo.status = 'inProgress';
        }

        // 2. Infer type based on parent context
        if (todo.parent_id && (todo.type === 'workitem' || todo.type === 'task' || !todo.type)) {
            const parent = todoMap.get(todo.parent_id);
            if (parent) {
                // Determine parent's type (recursively check if it's a project)
                const pType = getTodoType(parent);
                if (pType === 'project') {
                    todo.type = 'story';
                } else if (pType === 'story') {
                    todo.type = 'task';
                }
            } else if (todo.parent_id) {
                // Fallback: If we have a parent but can't find it in context, 
                // and we have subtasks, it's likely a story.
                if ((todo.subtask_count ?? 0) > 0) {
                    todo.type = 'story';
                }
            }
        }
        return todo;
    });
}
