export type TodoType = 'workitem' | 'story' | 'project' | 'task';

export function getTodoType(
    todo: { parent_id?: number | null; subtask_count?: number; type?: TodoType },
    subtasks?: { subtask_count?: number }[]
): TodoType {
    const hasSubtasks = (todo.subtask_count ?? 0) > 0;
    const isChild = !!todo.parent_id;

    // 1. Respect explicit type if it's 'project' or 'story' (strong types)
    if (todo.type === 'project' || todo.type === 'story') {
        return todo.type;
    }

    // 2. Hierarchy Enforcement for inferred types:
    if (isChild) {
        // If it has children itself, it's definitely a Story (nested in a Project).
        // Otherwise, if type is 'task' or unset, it's a Task.
        return hasSubtasks ? 'story' : 'task';
    }

    // 3. Root item fallback inference
    if (!hasSubtasks) return todo.type === 'workitem' ? 'workitem' : (todo.type || 'workitem');

    // Root with subtasks: Project if any child is itself a story
    if (subtasks && subtasks.some(s => (s.subtask_count ?? 0) > 0)) {
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
