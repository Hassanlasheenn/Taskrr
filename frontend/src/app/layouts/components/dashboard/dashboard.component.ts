import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { Subject, takeUntil, debounceTime, Observable, map } from "rxjs";
import { AuthService } from "../../../auth/services";
import { TodoService } from "../../../core/services/todo.service";
import { NotificationService } from "../../../core/services/notification.service";
import { ITodo, ITodoCreate, ITodoFilter, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { NavigationService } from "../../../core/services/navigation.service";
import { TodoListComponent } from "../todo-list/todo-list.component";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";
import { CalendarComponent } from "./components/calendar/calendar.component";
import { TodoStatus as FilterStatus } from "./components/status-filter/status-filter.component";
import { AdminPanelComponent } from "./components/admin-panel/admin-panel.component";
import { AdminComponent } from "../admin/admin.component";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { TodoFormComponent } from "../../../shared/components/dynamic-form/todo-form/todo-form.component";
import { SharedTableComponent } from "../../../shared/components/shared-table/shared-table.component";
import { CanComponentDeactivate } from "../../../auth/guards/can-deactivate.guard";
import { PosthogService } from "../../../core/services";
import { TodoColumnsComponent, ITodoStatusChange } from "../../../shared/components/todo-columns/todo-columns.component";
import { getTodoType, getTodoTypeLabel, getTodoTypeIcon, enrichTodoTypes, enrichTodo, flattenTodos } from "../../../shared/helpers/todo-type.helper";
import { TodoDetailDialogService } from "../../../core/services/todo-detail-dialog.service";

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: true,
    imports: [
        CommonModule, 
        RouterLink,
        TodoListComponent, 
        SidebarComponent, 
        CalendarComponent, 
        AdminPanelComponent,
        AdminComponent,
        TodoFormComponent,
        SharedTableComponent,
        TodoColumnsComponent,
    ],
})
export class DashboardComponent implements OnInit, OnDestroy, CanComponentDeactivate {
    @ViewChild('todoForm') todoFormComponent!: TodoFormComponent;
    private readonly _destroy$ = new Subject<void>();
    
    userData: any;
    todos: ITodo[] = [];
    totalTodos: number = 0;
    isSidebarOpen: boolean = false;
    editingTodo: ITodo | null = null;
    parentIdForSubtask: number | null = null;
    parentTodoForSubtask: ITodo | null = null;
    activeSection: DashboardSections = DashboardSections.DASHBOARD;

    // Stories
    selectedStory: ITodo | null = null;
    storySubtasks: ITodo[] = [];
    loadingStorySubtasks = false;
    selectedProject: ITodo | null = null;
    projectStories: ITodo[] = [];
    classifyingStories = false;
    private _storyChildCache = new Map<number, ITodo[]>();
    _expandedProjectIds = new Set<number>();

    private _refreshProjectStoriesCache(projectId: number): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this._todoService.getSubtasks(userId, projectId)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (res) => {
                    const children = enrichTodoTypes(res.todos as ITodo[], [{ id: projectId }, ...(res.todos as ITodo[])]);
                    this._storyChildCache.set(projectId, children);
                    // Also refresh current view if it's the selected project
                    if (this.selectedProject && this.selectedProject.id === projectId) {
                        this.projectStories = children;
                    }
                }
            });
    }

    onToggleProjectExpand(project: ITodo, event: MouseEvent): void {
        event.stopPropagation();
        if (this._expandedProjectIds.has(project.id)) {
            this._expandedProjectIds.delete(project.id);
        } else {
            this._expandedProjectIds.add(project.id);
            if (!this._storyChildCache.has(project.id)) {
                // Optimized: Check if subtasks already exist in the project object
                if (project.subtasks && project.subtasks.length > 0) {
                    this._storyChildCache.set(project.id, project.subtasks);
                    return;
                }

                const userId = this._authService.getCurrentUserId();
                if (!userId) return;
                this._todoService.getSubtasks(userId, project.id)
                    .pipe(takeUntil(this._destroy$))
                    .subscribe({
                        next: (res) => {
                            this._storyChildCache.set(project.id, res.todos as ITodo[]);
                        }
                    });
            }
        }
    }

    isProjectExpanded(projectId: number): boolean {
        return this._expandedProjectIds.has(projectId);
    }

    getProjectStories(projectId: number): ITodo[] {
        return this._storyChildCache.get(projectId) || [];
    }

    getProjectProgress(project: ITodo): number {
        if (!project.subtask_count) return project.status === 'done' ? 100 : 0;
        
        const children = this._storyChildCache.get(project.id);
        if (!children || children.length === 0) {
            // Fallback if not loaded: if status is done, it's 100
            return project.status === 'done' ? 100 : 0;
        }

        const doneCount = children.filter(c => c.status === 'done').length;
        return Math.round((doneCount / children.length) * 100);
    }

    DashboardSections = DashboardSections;
    searchQuery: string = '';
    activeStatus: FilterStatus = 'all';
    activePriority: string = 'all';
    selectedCategory: string | null = null;
    trackById = trackById;
    readonly LayoutPaths = LayoutPaths;
    collapsedSections: Set<string> = new Set();
    isAdmin: boolean = false;
    viewMode: 'grid' | 'table' = 'grid';

    // Completed section pagination
    completedTodos: ITodo[] = [];
    completedTotal: number = 0;
    completedSkip: number = 0;
    readonly completedLimit: number = 6;
    hasMoreCompleted: boolean = true;
    loadingMoreCompleted: boolean = false;

    // Table-view pagination state (separate from grid data)
    tableTodos: ITodo[] = [];
    tableTotal: number = 0;
    tablePage: number = 1;
    tablePageSize: number = 5;
    tableSortOrder: 'asc' | 'desc' = 'desc';
    tableFilter: ITodoFilter = {};
    private _tableLoadId = 0;

    constructor(
        public readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _notificationService: NotificationService,
        private readonly _toastService: ToastService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _router: Router,
        private readonly _navService: NavigationService,
        private readonly _posthogService: PosthogService,
        private readonly _detailDialogService: TodoDetailDialogService
    ) {}

    ngOnInit(): void {
        const savedViewMode = localStorage.getItem('dashboardViewMode');
        if (savedViewMode === 'grid' || savedViewMode === 'table') {
            this.viewMode = savedViewMode;
        }

        this.isAdmin = this._authService.isAdmin();
        this.userData = this._authService.getCurrentUserData();
        this.loadTodos();
        if (this.viewMode === 'table') {
            this.loadTableTodos();
        }
        this._syncSectionWithUrl();

        // Listen to route changes for back/forward support
        this._router.events
            .pipe(takeUntil(this._destroy$))
            .subscribe(() => {
                this._syncSectionWithUrl();
            });

        this._detailDialogService.todoUpdated$
            .pipe(takeUntil(this._destroy$))
            .subscribe(updated => {
                if (updated) {
                    const idx = this.todos.findIndex(t => t.id === updated.id);
                    const parentChanged = idx !== -1 && this.todos[idx].parent_id !== updated.parent_id;
                    const oldParentId = idx !== -1 ? this.todos[idx].parent_id : null;
                    const newParentId = updated.parent_id;

                    if (idx !== -1) {
                        this.todos[idx] = { ...updated };
                        this.todos = [...this.todos];
                    } else {
                        this.loadTodos();
                    }

                    if (parentChanged) {
                        if (oldParentId) this._storyChildCache.delete(oldParentId);
                        if (newParentId) this._storyChildCache.delete(newParentId);
                        
                        if (this.selectedProject && (this.selectedProject.id === oldParentId || this.selectedProject.id === newParentId)) {
                            this.onSelectProject(this.selectedProject);
                        }
                        this.loadTodos();
                    }

                    const compIdx = this.completedTodos.findIndex(t => t.id === updated.id);
                    if (compIdx !== -1) {
                        this.completedTodos[compIdx] = { ...updated };
                        this.completedTodos = [...this.completedTodos];
                    }
                }
            });

        this._notificationService.notificationEvents$
            .pipe(
                debounceTime(300),
                takeUntil(this._destroy$)
            )
            .subscribe((notification) => {
                if (notification.todo_id) {
                    this.loadTodos();
                }
            });
    }

    loadTodos(): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.getTodos(userId, 0, 100, 'desc', {}, undefined, true).pipe(takeUntil(this._destroy$)).subscribe({
            next: (response) => {
                this.todos = enrichTodoTypes(response.todos as ITodo[]);
                this.totalTodos = response.total;
                if (this.activeSection === DashboardSections.STORIES) {
                    this._loadStoryClassification();
                }
            },
            error: (error) => {
                this._toastService.error(error?.error?.detail || 'Failed to load todos');
            }
        });
    }

    loadCompletedTodos(isLoadMore: boolean = false): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        if (!isLoadMore) {
            this.completedSkip = 0;
            this.hasMoreCompleted = true;
        }
        
        this.loadingMoreCompleted = true;
        this._todoService.getTodos(userId, this.completedSkip, this.completedLimit, 'desc', { status: 'done' })
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (response) => {
                    const newTodos = response.todos as ITodo[];
                    if (isLoadMore) {
                        this.completedTodos = [...this.completedTodos, ...newTodos];
                    } else {
                        this.completedTodos = newTodos;
                    }
                    this.completedTotal = response.total;
                    this.hasMoreCompleted = this.completedTodos.length < this.completedTotal;
                    this.loadingMoreCompleted = false;
                },
                error: (error) => {
                    this.loadingMoreCompleted = false;
                    this._toastService.error(error?.error?.detail || 'Failed to load completed todos');
                }
            });
    }

    loadMoreCompleted(): void {
        if (this.loadingMoreCompleted || !this.hasMoreCompleted) return;
        this.completedSkip += this.completedLimit;
        this.loadCompletedTodos(true);
    }

    get sidebarTitle(): string {
        if (this.editingTodo) return 'Edit Todo';
        
        if (this.parentIdForSubtask) {
            const parent = this.todos.find(t => t.id === this.parentIdForSubtask);
            if (parent) {
                const parentType = getTodoType(parent);
                if (parentType === 'project') return 'Add Story';
                if (parentType === 'story') return 'Add Task';
            }
            
            // Fallback for STORIES section
            if (this.activeSection === DashboardSections.STORIES) {
                if (this.selectedProject && this.parentIdForSubtask === this.selectedProject.id) return 'Add Story';
                if (this.selectedStory && this.parentIdForSubtask === this.selectedStory.id) return 'Add Task';
            }
            
            return 'Add Task';
        }

        if (this.activeSection === DashboardSections.STORIES) {
            return 'Add New Project';
        }

        return 'Add New Todo';
    }

    get _forcedTodoType(): string | null {
        // If we have a parent, determine forced type based on parent's type
        if (this.parentIdForSubtask) {
            const parent = this.todos.find(t => t.id === this.parentIdForSubtask);
            if (parent) {
                const parentType = getTodoType(parent);
                if (parentType === 'project') return 'story';
                if (parentType === 'story') return 'task';
            }
            
            // Fallback for STORIES section specifically if parent not in main list (e.g. nested navigation)
            if (this.activeSection === DashboardSections.STORIES) {
                if (this.selectedStory && this.parentIdForSubtask === this.selectedStory.id) return 'task';
                if (this.selectedProject && this.parentIdForSubtask === this.selectedProject.id) return 'story';
            }
        }

        if (this.activeSection === DashboardSections.STORIES && !this.parentIdForSubtask) {
            return 'project';
        }

        return null;
    }

    get timeBasedGreeting(): string {
        const hour = new Date().getHours();
        
        if (hour >= 5 && hour < 12) {
            return 'Good Morning';
        } else if (hour >= 12 && hour < 17) {
            return 'Good Afternoon';
        } else if (hour >= 17 && hour < 22) {
            return 'Good Evening';
        } else {
            return 'Good Night';
        }
    }

    onAddTodo(): void {
        this.editingTodo = null;
        this.parentIdForSubtask = null;
        this.parentTodoForSubtask = null;
        this.isSidebarOpen = true;
    }

    onSidebarClose(): void {
        if (this.todoFormComponent?.hasChanges()) {
            this._confirmationDialog.show({
                title: 'Unsaved Changes',
                message: 'You have unsaved changes in your todo. Are you sure you want to discard them?',
                confirmText: 'Discard',
                cancelText: 'Keep Editing',
                confirmButtonClass: 'btn-danger'
            }).pipe(takeUntil(this._destroy$)).subscribe(result => {
                if (result.confirmed) {
                    this._closeSidebarInternal();
                }
            });
        } else {
            this._closeSidebarInternal();
        }
    }

    private _closeSidebarInternal(): void {
        this.isSidebarOpen = false;
        this.editingTodo = null;
        this.parentIdForSubtask = null;
        this.parentTodoForSubtask = null;
        if (this.todoFormComponent) {
            this.todoFormComponent.resetForm();
        }
    }

    onTodoSubmit(todoData: ITodoCreate): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.createTodo(userId, todoData)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (newTodo) => {
                    this._closeSidebarInternal();
                    const enriched = enrichTodo(newTodo, this.todos);
                    
                    // Manually increment the subtask_count of the parent in the local list for immediate UI feedback
                    const createdParentId = (enriched as ITodo).parent_id;
                    if (createdParentId) {
                        const parentIdx = this.todos.findIndex(t => t.id === createdParentId);
                        if (parentIdx !== -1) {
                            this.todos[parentIdx] = { 
                                ...this.todos[parentIdx], 
                                subtask_count: (this.todos[parentIdx].subtask_count || 0) + 1 
                            };
                            this.todos = [...this.todos]; // Trigger change detection
                        }

                        this._storyChildCache.delete(createdParentId);
                        
                        // Case 1: We are currently in the project detail view
                        if (this.selectedProject) {
                            // If the added item is a direct child of the project OR 
                            // if it's a child of a story currently visible in the project view
                            if (this.selectedProject.id === createdParentId || 
                                this.projectStories.some(s => s.id === createdParentId)) {
                                this.onSelectProject(this.selectedProject);
                            }
                        } 
                        // Case 2: We are in the landing view and the parent project is expanded
                        else if (this._expandedProjectIds.has(createdParentId)) {
                            this._refreshProjectStoriesCache(createdParentId);
                        }
                    }
                    this.loadTodos();
                    if (this.viewMode === 'table') {
                        this.loadTableTodos();
                    }
                    
                    // Notify other components (like columns) via the shared service
                    this._detailDialogService.notifyUpdate(enriched as ITodo);

                    // If we're in a story detail view, append the new task immediately
                    if (this.selectedStory && (enriched as ITodo).parent_id === this.selectedStory.id) {
                        this.storySubtasks = [...this.storySubtasks, enriched as ITodo];
                    }
                    this._toastService.success('Todo created successfully');
                    this._posthogService.capture('todo_created', {
                        category: newTodo.category,
                        priority: newTodo.priority
                    });
                },
                error: (error) => {
                    this._toastService.error(error?.error?.detail || 'Failed to create todo');
                }
            });
    }

    onToggleTodo(todo: ITodo): void {
        const index = this.todos.findIndex(t => t.id === todo.id);
        if (index !== -1) {
            const newStatus = todo.status === 'done' ? 'new' : 'done';
            this.todos[index] = { ...todo, status: newStatus as ITodo['status'] };
            this.todos = [...this.todos];
            this._posthogService.capture('todo_status_toggled', { 
                todo_id: todo.id,
                new_status: newStatus 
            });
        }
    }

    onDeleteTodo(todo: ITodo): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._confirmationDialog.show({
            title: 'Delete Todo',
            message: `Are you sure you want to delete "${todo.title}"? This action cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel'
        })
        .pipe(takeUntil(this._destroy$))
        .subscribe(result => {
            if (result.confirmed) {
                this._todoService.deleteTodo(userId, todo.id).subscribe({
                    next: (response) => {
                        const parentId = todo.parent_id;
                        if (parentId) {
                            this._storyChildCache.delete(parentId);
                            if (this.selectedProject && this.selectedProject.id === parentId) {
                                this.onSelectProject(this.selectedProject);
                            }
                        }

                        // Remove from the local lists entirely so it reflects on UI immediately
                        this.todos = this.todos.filter(t => t.id !== todo.id);
                        this.tableTodos = this.tableTodos.filter(t => t.id !== todo.id);
                        this.storySubtasks = this.storySubtasks.filter(t => t.id !== todo.id);
                        
                        if (parentId) {
                            this.loadTodos();
                        }

                        this._toastService.success(response?.message || 'Todo deleted successfully');
                        this._posthogService.capture('todo_deleted', { todo_id: todo.id });
                    },
                    error: (error) => {
                        this._toastService.error(error?.error?.detail || 'Failed to delete todo');
                    }
                });
            }
        });
    }

    onViewTodo(todo: ITodo): void {
        this._posthogService.capture('todo_view_clicked', { todo_id: todo.id });
        this._router.navigate([LayoutPaths.TODO_VIEW, todo.id]);
    }

    onEditTodo(todo: ITodo): void {
        this.editingTodo = todo;
        this.parentIdForSubtask = null;
        this.isSidebarOpen = true;

        // Wait for sidebar to open and form component to be ready
        setTimeout(() => {
            if (this.todoFormComponent) {
                this.todoFormComponent.populateForm(todo);
            }
        }, 200);
    }

    onAddSubtask(parentTodo: ITodo): void {
        this.editingTodo = null;
        this.parentIdForSubtask = parentTodo.id;
        this.parentTodoForSubtask = parentTodo;
        this.isSidebarOpen = true;
    }

    getStoryTypeLabel(story: ITodo): string {
        const children = this._storyChildCache.get(story.id);
        return getTodoTypeLabel(getTodoType(story, children));
    }
    getStoryTypeIcon(story: ITodo): string {
        const children = this._storyChildCache.get(story.id);
        return getTodoTypeIcon(getTodoType(story, children));
    }
    getListItemTypeLabel(story: ITodo): string {
        const children = this._storyChildCache.get(story.id);
        return getTodoTypeLabel(getTodoType(story, children));
    }
    getListItemTypeIcon(story: ITodo): string {
        const children = this._storyChildCache.get(story.id);
        return getTodoTypeIcon(getTodoType(story, children));
    }

    onSelectStory(story: ITodo): void {
        this.selectedStory = story;
        this.storySubtasks = [];
        this.loadingStorySubtasks = true;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this._todoService.getSubtasks(userId, story.id)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (res) => {
                    let children = enrichTodoTypes(res.todos as ITodo[], [story, ...(res.todos as ITodo[])]);
                    if (this.selectedCategory) {
                        children = children.filter(t => t.category === this.selectedCategory);
                    }
                    this.storySubtasks = children;
                    this.loadingStorySubtasks = false;
                },
                error: () => { this.loadingStorySubtasks = false; }
            });
    }

    onSelectStoryInProject(story: ITodo, project: ITodo): void {
        this.onSelectProject(project);
        this.onSelectStory(story);
    }

    onStoriesItemClick(todo: ITodo): void {
        if (todo.type === 'project' || (todo.subtask_count && !todo.parent_id)) {
            this.onSelectProject(todo);
        } else {
            this.onSelectStory(todo);
        }
    }

    onBackToStories(): void {
        this.selectedStory = null;
        this.storySubtasks = [];
    }

    onSelectProject(project: ITodo): void {
        this.selectedProject = project;
        this.selectedStory = null;
        this.storySubtasks = [];
        const cached = this._storyChildCache.get(project.id);
        if (cached && !this.selectedCategory) {
            this.projectStories = cached;
        } else {
            const userId = this._authService.getCurrentUserId();
            if (!userId) return;
            this._todoService.getSubtasks(userId, project.id)
                .pipe(takeUntil(this._destroy$))
                .subscribe({
                    next: (res) => {
                        let children = enrichTodoTypes(res.todos as ITodo[], [project, ...(res.todos as ITodo[])]);
                        if (!this.selectedCategory) {
                            this._storyChildCache.set(project.id, children);
                        } else {
                            children = children.filter(t => t.category === this.selectedCategory);
                        }
                        this.projectStories = children;
                    }
                });
        }
    }

    onBackFromProject(): void {
        this.selectedProject = null;
        this.projectStories = [];
        this.selectedStory = null;
        this.storySubtasks = [];
    }

    get projectTodos(): ITodo[] {
        return this.filteredTodos.filter(t => t.type === 'project');
    }

    get plainStoryTodos(): ITodo[] {
        return this.filteredTodos.filter(t => t.type !== 'project' && !t.parent_id);
    }

    private _loadStoryClassification(): void {
        const storiesWithSubtasks = this.todos.filter(t => (t.subtask_count ?? 0) > 0);
        if (!storiesWithSubtasks.length) { 
            this.classifyingStories = false; 
            return; 
        }

        // Optimized: Immediately populate cache from already loaded subtasks
        storiesWithSubtasks.forEach(todo => {
            if (todo.subtasks && todo.subtasks.length > 0 && !this._storyChildCache.has(todo.id)) {
                const enriched = enrichTodoTypes(todo.subtasks, [todo, ...todo.subtasks]);
                this._storyChildCache.set(todo.id, enriched);
            }
        });

        // Only fetch what's still missing from cache
        const stillUncached = storiesWithSubtasks.filter(s => !this._storyChildCache.has(s.id));
        if (!stillUncached.length) { 
            this.classifyingStories = false; 
            return; 
        }

        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this.classifyingStories = true;
        let pending = stillUncached.length;
        stillUncached.forEach(story => {
            this._todoService.getSubtasks(userId, story.id)
                .pipe(takeUntil(this._destroy$))
                .subscribe({
                    next: (res) => {
                        const enriched = enrichTodoTypes(res.todos as ITodo[], [story, ...(res.todos as ITodo[])]);
                        this._storyChildCache.set(story.id, enriched);
                        if (--pending === 0) this.classifyingStories = false;
                    },
                    error: () => { if (--pending === 0) this.classifyingStories = false; }
                });
        });
    }

    onTodoUpdate(event: { id: number; data: ITodoUpdate }): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.updateTodo(userId, event.id, event.data)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (updatedTodo: any) => {
                    this._closeSidebarInternal();
                    const enriched = enrichTodo(updatedTodo, this.todos);

                    // Invalidate cache for old and new parent so both reload their children
                    const oldParentId = this.todos.find(t => t.id === event.id)?.parent_id;
                    const newParentId = event.data.parent_id;
                    if (oldParentId) this._storyChildCache.delete(oldParentId);
                    if (newParentId) this._storyChildCache.delete(newParentId);

                    // If we are currently viewing a project that was affected, refresh it
                    if (this.selectedProject && (this.selectedProject.id === oldParentId || this.selectedProject.id === newParentId)) {
                        this.onSelectProject(this.selectedProject);
                    }

                    // Update in main todos list
                    const idx = this.todos.findIndex(t => t.id === event.id);
                    const parentChanged = idx !== -1 && this.todos[idx].parent_id !== (enriched as ITodo).parent_id;

                    if (idx !== -1) {
                        this.todos[idx] = { ...this.todos[idx], ...enriched } as ITodo;
                        this.todos = [...this.todos];
                    }
                    
                    if (parentChanged || idx === -1) {
                        this.loadTodos();
                    }
                    // Update in story subtasks if present
                    const subIdx = this.storySubtasks.findIndex(t => t.id === event.id);
                    if (subIdx !== -1) {
                        this.storySubtasks[subIdx] = { ...this.storySubtasks[subIdx], ...enriched } as ITodo;
                        this.storySubtasks = [...this.storySubtasks];
                    }
                    if (this.viewMode === 'table') {
                        this.loadTableTodos();
                    }
                    this._toastService.success('Todo updated successfully');
                    this._posthogService.capture('todo_updated', {
                        todo_id: event.id,
                        status: event.data.status,
                        priority: event.data.priority
                    });
                },
                error: (error: any) => {
                    this._toastService.error(error?.error?.detail || 'Failed to update todo');
                }
            });
    }

    onTodoUnassign(todo: ITodo): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.updateTodo(userId, todo.id, { assigned_to_user_id: null })
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (updatedTodo) => {
                    const idx = this.todos.findIndex(t => t.id === todo.id);
                    if (idx !== -1) {
                        this.todos[idx] = { ...this.todos[idx], ...updatedTodo } as ITodo;
                        this.todos = [...this.todos];
                    }
                    this._toastService.success('Todo unassigned successfully');
                },
                error: () => {
                    this._toastService.error('Failed to unassign todo');
                    this.loadTodos();
                }
            });
    }

    onTodoStatusChange(event: ITodoStatusChange): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        const updateData: any = { status: event.newStatus as ITodo['status'] };
        
        // If it was unassigned, assign it to the current user who is moving it
        if (!event.todo.assigned_to_user_id) {
            updateData.assigned_to_user_id = userId;
        }

        this._todoService.updateTodo(userId, event.todo.id, updateData)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (updatedTodo) => {
                    const enriched = enrichTodo(updatedTodo, this.todos);
                    const idx = this.todos.findIndex(t => t.id === event.todo.id);
                    if (idx !== -1) {
                        this.todos[idx] = { ...this.todos[idx], ...enriched } as ITodo;
                        this.todos = [...this.todos];
                    }
                    // Update in story subtasks if present
                    const subIdx = this.storySubtasks.findIndex(t => t.id === event.todo.id);
                    if (subIdx !== -1) {
                        this.storySubtasks[subIdx] = { ...this.storySubtasks[subIdx], ...updatedTodo } as ITodo;
                        this.storySubtasks = [...this.storySubtasks];
                    }
                    this._toastService.success(`Status updated to ${event.newStatus}${!event.todo.assigned_to_user_id ? ' and assigned to you' : ''}`);
                },
                error: () => {
                    this._toastService.error('Failed to update status');
                    this.loadTodos();
                }
            });
    }

    toggleSection(section: string): void {
        if (this.collapsedSections.has(section)) {
            this.collapsedSections.delete(section);
        } else {
            this.collapsedSections.add(section);
        }
    }

    setViewMode(mode: 'grid' | 'table'): void {
        this.viewMode = mode;
        localStorage.setItem('dashboardViewMode', mode);
        this._posthogService.capture('dashboard_view_mode_changed', { mode });
        if (mode === 'table') {
            this.tablePage = 1;
            this.loadTableTodos();
        }
    }

    loadTableTodos(): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        
        const serverFilter: ITodoFilter = { ...this.tableFilter };
        const isTypeFiltering = !!serverFilter.type;
        const isStatusFiltering = !!serverFilter.status;
        
        // Handle Type and Status locally to ensure they work with enriched subtasks
        if (isTypeFiltering) delete serverFilter.type;
        if (isStatusFiltering) delete serverFilter.status;

        const loadId = ++this._tableLoadId;

        // Optimized: Single call with includeSubtasks=true
        this._todoService.getTodos(userId, 0, 1000, this.tableSortOrder, serverFilter, undefined, true).pipe(takeUntil(this._destroy$)).subscribe({
            next: (response) => {
                if (loadId !== this._tableLoadId) return;
                
                // 1. Flatten: Get every single item in the hierarchy
                const allTodos = flattenTodos(response.todos as ITodo[]);
                
                // 2. Enrich (Normalizes status and fixes types based on hierarchy)
                let processed = enrichTodoTypes(allTodos, [...this.todos, ...allTodos]);
                
                // 3. Local Filtering for consistency with visual badges
                if (this.tableFilter.type) {
                    processed = processed.filter(t => getTodoType(t) === this.tableFilter.type);
                }
                if (this.tableFilter.status) {
                    processed = processed.filter(t => t.status === this.tableFilter.status);
                }

                // Remove duplicates just in case
                const unique = Array.from(new Map(processed.map(t => [t.id, t])).values());

                this.tableTotal = unique.length;
                const skip = (this.tablePage - 1) * this.tablePageSize;
                this.tableTodos = unique.slice(skip, skip + this.tablePageSize);
            },
            error: (error) => {
                if (loadId !== this._tableLoadId) return;
                this._toastService.error(error?.error?.detail || 'Failed to load todos');
            }
        });
    }

    onTablePageChange(page: number): void {
        this.tablePage = page;
        this.loadTableTodos();
    }

    onTablePageSizeChange(size: number): void {
        this.tablePageSize = size;
        this.tablePage = 1;
        this.loadTableTodos();
    }

    onTableSortChange(order: 'asc' | 'desc'): void {
        this.tableSortOrder = order;
        this.tablePage = 1;
        this.loadTableTodos();
    }

    onTableFilterChange(filter: ITodoFilter): void {
        this.tableFilter = filter;
        this.tablePage = 1;
        this.loadTableTodos();
    }

    isSectionCollapsed(section: string): boolean {
        return this.collapsedSections.has(section);
    }

    private _syncSectionWithUrl(): void {
        const url = this._router.url.split('?')[0].replace('/', '');
        
        switch(url) {
            case LayoutPaths.CALENDAR: this.activeSection = DashboardSections.CALENDAR; break;
            case LayoutPaths.STORIES:
                this.activeSection = DashboardSections.STORIES;
                this.selectedProject = null;
                this.projectStories = [];
                if (this.todos.length) this._loadStoryClassification();
                break;
            case LayoutPaths.COMPLETED:
                this.activeSection = DashboardSections.COMPLETED;
                this.loadCompletedTodos();
                break;
            case LayoutPaths.ADMIN: this.activeSection = DashboardSections.USER_MANAGEMENT; break;
            case LayoutPaths.ADMIN_PANEL: this.activeSection = DashboardSections.ADMIN_PANEL; break;
            case LayoutPaths.DASHBOARD:
            case 'home':
            default: this.activeSection = DashboardSections.DASHBOARD; break;
        }
        
        // Reset filters when switching sections via URL
        this.searchQuery = '';
        this.activeStatus = 'all';
        this.activePriority = 'all';
        this.selectedCategory = null;
        this.selectedProject = null;
        this.projectStories = [];
        this.selectedStory = null;
        this.storySubtasks = [];
    }

    get unassignedCount(): number {
        return this.unassignedTodos.length;
    }

    get unassignedTodos(): ITodo[] {
        return this.todos.filter(todo => 
            todo.status !== 'done' && 
            (!todo.assigned_to_user_id || todo.assigned_to_user_id === null)
        );
    }

    get completedCount(): number {
        return this.todos.filter(todo => todo.status === 'done').length;
    }

    get hasActiveTodosInSection(): boolean {
        if (this.activeSection === DashboardSections.DASHBOARD) {
            return this.isAdmin ? this.unassignedCount > 0 : this.todos.length > 0;
        }
        return false;
    }

    get inProgressTodos(): ITodo[] { return this.filteredTodos.filter(t => t.status === 'inProgress'); }
    get newTodos(): ITodo[] { return this.filteredTodos.filter(t => t.status === 'new'); }
    get pausedTodos(): ITodo[] { return this.filteredTodos.filter(t => t.status === 'paused'); }

    get combinedActiveTodos(): ITodo[] {
        return [...this.newTodos, ...this.inProgressTodos];
    }

    getPriorityClass(priority: string): string {
        return `priority-${priority?.toLowerCase() || 'medium'}`;
    }

    getPriorityIcon(priority: string): string {
        switch (priority?.toLowerCase()) {
            case 'high': return 'bi-arrow-up';
            case 'low': return 'bi-arrow-down';
            default: return 'bi-dash';
        }
    }

    formatDate(dateString?: string): string {
        if (!dateString) return 'No date';
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }

    getDueDateUrgencyClass(dateString?: string): string {
        if (!dateString) return '';
        
        const dueDate = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 3) return 'urgency-high';
        if (diffDays <= 10) return 'urgency-medium';
        return 'urgency-low';
    }

    get sectionTitle(): string {
        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                return 'Completed Todos';
            case DashboardSections.DASHBOARD:
                return this.isAdmin ? 'Pending Todos' : 'Your Todos';
            default:
                return 'Your Todos';
        }
    }

    getStatusLabel(status: string): string {
        const statusMap: { [key: string]: string } = {
            'new': 'New',
            'inProgress': 'In Progress',
            'paused': 'Paused',
            'done': 'Done'
        };
        return statusMap[status] || status;
    }

    getStatusClass(status: string): string {
        return `status-${status}`;
    }

    onSearchChange(query: string): void {
        this.searchQuery = query.toLowerCase().trim();
    }

    onStatusChange(status: FilterStatus): void {
        this.activeStatus = status;
    }

    onPriorityChange(priority: string): void {
        this.activePriority = priority;
    }

    private applyPriorityFilter(todos: ITodo[]): ITodo[] {
        if (this.activePriority === 'all') return todos;
        return todos.filter(todo => todo.priority === this.activePriority);
    }

    get filteredTodos(): ITodo[] {
        let filtered = this.todos;
        const isAdmin = this.isAdmin;
        const userId = this._authService.getCurrentUserId();

        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                filtered = filtered.filter(todo => todo.status === 'done');
                break;
            case DashboardSections.STORIES:
                filtered = filtered.filter(todo => 
                    todo.type === 'project' || 
                    todo.type === 'story' || 
                    (todo.subtask_count ?? 0) > 0
                );
                if (!isAdmin) {
                    filtered = filtered.filter(todo =>
                        todo.assigned_to_user_id === userId || todo.user_id === userId
                    );
                }
                break;
            case DashboardSections.DASHBOARD:
                if (!isAdmin) {
                    filtered = filtered.filter(todo =>
                        todo.assigned_to_user_id === userId || todo.user_id === userId
                    );
                }
                break;
            default:
                break;
        }

        if (this.activeSection === DashboardSections.DASHBOARD) {
            filtered = this.applyStatusFilter(filtered);
            filtered = this.applyPriorityFilter(filtered);
        }

        if (this.searchQuery) {
            filtered = filtered.filter(todo => {
                const titleMatch = todo.title.toLowerCase().includes(this.searchQuery);
                const descMatch = todo.description?.toLowerCase().includes(this.searchQuery);
                return titleMatch || descMatch;
            });
        }

        if (this.selectedCategory) {
            filtered = filtered.filter(todo => todo.category === this.selectedCategory);
        }

        const statusOrder: { [key: string]: number } = {
            'inProgress': 0,
            'new': 1,
            'paused': 2,
            'done': 3
        };

        return filtered.sort((a, b) => {
            // Deleted todos always go to the end
            if (a.is_deleted !== b.is_deleted) {
                return a.is_deleted ? 1 : -1;
            }

            const statusA = statusOrder[a.status] ?? 1;
            const statusB = statusOrder[b.status] ?? 1;
            if (statusA !== statusB) {
                return statusA - statusB;
            }

            const categoryA = a.category || '\uffff';
            const categoryB = b.category || '\uffff';
            if (categoryA !== categoryB) {
                return categoryA.localeCompare(categoryB);
            }

            return (a.order_index || 0) - (b.order_index || 0);
        });
    }

    private applyStatusFilter(todos: ITodo[]): ITodo[] {
        switch (this.activeStatus) {
            case 'done':
                return todos.filter(todo => todo.status === 'done');
            case 'new':
                return todos.filter(todo => todo.status === 'new');
            case 'inProgress':
                return todos.filter(todo => todo.status === 'inProgress');
            case 'paused':
                return todos.filter(todo => todo.status === 'paused');
            case 'all':
            default:
                return todos;
        }
    }

    get categories(): string[] {
        // Get categories from filtered todos (after status and search filters, but not category filter)
        let filtered = this.todos;
        const isAdmin = this.isAdmin;
        const userId = this._authService.getCurrentUserId();

        // Apply section filter
        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                filtered = filtered.filter(todo => todo.status === 'done');
                break;
            case DashboardSections.DASHBOARD:
                if (!isAdmin) {
                    filtered = filtered.filter(todo => 
                        todo.assigned_to_user_id === userId || todo.user_id === userId
                    );
                }
                break;
            default:
                break;
        }

        // Apply status filter
        if (this.activeSection === DashboardSections.DASHBOARD) {
            filtered = this.applyStatusFilter(filtered);
            filtered = this.applyPriorityFilter(filtered);
        }

        // Apply search filter
        if (this.searchQuery) {
            filtered = filtered.filter(todo => {
                const titleMatch = todo.title.toLowerCase().includes(this.searchQuery);
                const descMatch = todo.description?.toLowerCase().includes(this.searchQuery);
                return titleMatch || descMatch;
            });
        }

        // Extract unique categories (don't apply category filter here)
        const cats = new Set<string>();
        filtered.forEach(todo => {
            if (todo.category) {
                cats.add(todo.category);
            }
        });
        return Array.from(cats).sort();
    }

    onCategorySelect(category: string | null): void {
        this.selectedCategory = category;
    }

    canDeactivate(): boolean | Observable<boolean> {
        if (this.isSidebarOpen && this.todoFormComponent?.hasChanges()) {
            return this._confirmationDialog.show({
                title: 'Unsaved Changes',
                message: 'You have unsaved changes in your todo. Are you sure you want to leave?',
                confirmText: 'Leave',
                cancelText: 'Stay'
            }).pipe(map(result => result.confirmed));
        }
        return true;
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
