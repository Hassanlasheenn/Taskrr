import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Observable, Subject } from "rxjs";
import { map, takeUntil } from "rxjs/operators";
import { AuthService } from "../../../auth/services/auth.service";
import { UserService } from "../../../core/services/user.service";
import { TodoService } from "../../../core/services/todo.service";
import { IUserListResponse } from "../../../auth/interfaces";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { ITodo, ITodoComment, ITodoHistoryEntry, TodoStatus } from "../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { CanComponentDeactivate } from "../../../auth/guards";
import { ParseMentionsPipe } from "../../../core/pipes/parse-mentions.pipe";
import { TabsComponent, ITabItem } from "../../../shared/components/tabs";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { DashboardSideNavComponent } from "../dashboard/components/dashboard-side-nav/dashboard-side-nav.component";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { NavigationService } from "../../../core/services/navigation.service";

type StatusOption = { value: TodoStatus; label: string };
type PriorityOption = { value: 'low' | 'medium' | 'high'; label: string };

const STATUS_OPTIONS: StatusOption[] = [
    { value: 'new', label: 'New' },
    { value: 'inProgress', label: 'In Progress' },
    { value: 'paused', label: 'Paused' },
    { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS: PriorityOption[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

@Component({
    selector: 'app-todo-view',
    templateUrl: './todo-view.component.html',
    styleUrls: ['./todo-view.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, ParseMentionsPipe, TabsComponent, DashboardSideNavComponent, SidebarComponent],
})
export class TodoViewComponent implements OnInit, OnDestroy, CanComponentDeactivate {
    private readonly _destroy$ = new Subject<void>();
    todo: ITodo | null = null;
    saving = false;
    initialStatus: TodoStatus | null = null;
    initialPriority: 'low' | 'medium' | 'high' | null = null;
    initialDescription: string | null = null;
    initialAssignedToUserId: number | null = null;
    initialDueDate: string | null = null;
    todoDueDate: string = '';
    mentionableUsers: IUserListResponse[] = [];
    comments: ITodoComment[] = [];
    newCommentText = '';
    addingComment = false;
    showMentionDropdown = false;
    mentionFilter = '';
    mentionStartIndex = -1;
    highlightedMentionIndex = 0;
    mentionedUserIdsInComment: number[] = [];
    editingCommentId: number | null = null;
    editContent = '';
    savingEdit = false;
    deletingCommentId: number | null = null;
    commentHistoryTab: 'comments' | 'history' = 'comments';
    commentHistory: ITodoHistoryEntry[] = [];
    loadingHistory = false;
    trackById = trackById;
    isNavSidebarOpen: boolean = false;
    selectedFile: File | null = null;
    previewSelectedUrl: string | null = null;
    previewAttachmentUrl: string | null = null;
    previewAttachmentName: string | null = null;
    editAttachmentUrl: string | null = null;
    shouldDeleteAttachment: boolean = false;

    trackByValue(index: number, item: any): any {
        return item.value ?? index;
    }

    trackByHistoryEntry(index: number, item: ITodoHistoryEntry): string | number {
        return item.id ?? index;
    }

    readonly commentHistoryTabs: ITabItem[] = [
        { id: 'comments', label: 'Comments', icon: 'bi-chat-left-text' },
        { id: 'history', label: 'History', icon: 'bi-clock-history' },
    ];
    LayoutPaths = LayoutPaths;
    @ViewChild('newCommentInput') newCommentInputRef?: ElementRef<HTMLTextAreaElement>;

    readonly statusOptions = STATUS_OPTIONS;
    readonly priorityOptions = PRIORITY_OPTIONS;

    get mentionableUsersFiltered(): IUserListResponse[] {
        const q = (this.mentionFilter || '').toLowerCase();
        if (!q) return this.mentionableUsers;
        return this.mentionableUsers.filter((u) => (u.username || '').toLowerCase().includes(q));
    }

    get isAdmin(): boolean {
        return this._authService.isAdmin();
    }

    get hasChanges(): boolean {
        if (!this.todo || this.initialStatus === null || this.initialPriority === null) return false;
        const statusChanged = this.todo.status !== this.initialStatus;
        const priorityChanged = this.todo.priority !== this.initialPriority;
        const descriptionChanged = (this.todo.description ?? '') !== (this.initialDescription ?? '');
        const assignedChanged = (this.todo.assigned_to_user_id ?? null) !== this.initialAssignedToUserId;
        const dueDateChanged = (this.todoDueDate || null) !== this.initialDueDate;
        return statusChanged || priorityChanged || descriptionChanged || assignedChanged || dueDateChanged;
    }

    constructor(
        private readonly _route: ActivatedRoute,
        private readonly _router: Router,
        private readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _userService: UserService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _cdr: ChangeDetectorRef,
        private readonly _navService: NavigationService
    ) {}

    canDeactivate(): boolean | Observable<boolean> {
        if (!this.hasChanges) return true;
        return this._confirmationDialog.show({
            title: 'Unsaved changes',
            message: 'You have unsaved changes. Leave without saving?',
            confirmText: 'Leave',
            cancelText: 'Stay',
            confirmButtonClass: 'btn-primary',
        }).pipe(map((result) => result.confirmed));
    }

    ngOnInit(): void {
        const idParam = this._route.snapshot.paramMap.get('id');
        const todoId = idParam ? Number.parseInt(idParam, 10) : Number.NaN;
        if (!idParam || Number.isNaN(todoId)) {
            this._toastService.error('Invalid todo');
            this._router.navigate([LayoutPaths.DASHBOARD]);
            return;
        }
        const userId = this._authService.getCurrentUserId();
        if (!userId) {
            this._router.navigate([LayoutPaths.DASHBOARD]);
            return;
        }

        this._navService.toggleNavSidebar$
            .pipe(takeUntil(this._destroy$))
            .subscribe(() => {
                this.isNavSidebarOpen = !this.isNavSidebarOpen;
            });

        this._loaderService.show();
        this._todoService.getTodo(userId, todoId).subscribe({
            next: (response) => {
                this.todo = {
                    ...response,
                    status: (response.status ?? 'new') as TodoStatus,
                    priority: (response.priority ?? 'medium') as 'low' | 'medium' | 'high',
                } as ITodo;
                this.initialStatus = this.todo.status;
                this.initialPriority = this.todo.priority;
                this.initialDescription = this.todo.description ?? null;
                this.initialAssignedToUserId = this.todo.assigned_to_user_id ?? null;
                this.initialDueDate = this.todo.due_date ? this.todo.due_date.split('T')[0] : null;
                this.todoDueDate = this.initialDueDate || '';
                this._loadMentionableUsers();
                this._loadComments();
                this._loaderService.hide();
            },
            error: (error) => {
                this._loaderService.hide();
                this._toastService.error(error?.error?.detail || 'Failed to load todo');
                this._router.navigate([LayoutPaths.DASHBOARD]);
            }
        });
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    onDashboardSectionChange(section: DashboardSections): void {
        let path = '';
        switch(section) {
            case DashboardSections.CALENDAR: path = LayoutPaths.CALENDAR; break;
            case DashboardSections.COMPLETED: path = LayoutPaths.COMPLETED; break;
            case DashboardSections.USER_MANAGEMENT: path = LayoutPaths.ADMIN; break;
            default: path = LayoutPaths.DASHBOARD; break;
        }
        this._router.navigate([path]);
    }

    onNavSidebarClose(): void {
        this.isNavSidebarOpen = false;
    }

    isImage(filename?: string | null): boolean {
        if (!filename) return false;
        const ext = filename.split('.').pop()?.toLowerCase();
        return !!ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    }

    openPreview(url: string, name: string, event: MouseEvent): void {
        event.preventDefault();
        this.previewAttachmentUrl = url;
        this.previewAttachmentName = name;
    }

    closePreview(): void {
        this.previewAttachmentUrl = null;
        this.previewAttachmentName = null;
    }

    private _loadMentionableUsers(): void {
        this._userService.getMentionableUsers().subscribe({
            next: (list) => { 
                this.mentionableUsers = list; 
                // Always add the current user to the list if not already present
                const currentUser = this._authService.getCurrentUserData();
                if (currentUser && !this.mentionableUsers.some(u => u.id === currentUser.id)) {
                    this.mentionableUsers.unshift({
                        id: currentUser.id,
                        username: `${currentUser.username} (Me)`,
                        email: currentUser.email,
                        role: currentUser.role || 'user',
                        photo: currentUser.photo || null,
                        is_verified: currentUser.is_verified
                    });
                }
            },
            error: () => { this.mentionableUsers = []; },
        });
    }

    assigneeInList(userId: number): boolean {
        return this.mentionableUsers.some((u) => u.id === userId);
    }

    private _loadComments(): void {
        if (!this.todo) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this._todoService.getTodoComments(userId, this.todo.id).subscribe({
            next: (res) => {
                this.comments = res.comments ?? [];
            },
            error: () => {
                this.comments = [];
            },
        });
    }

    isCurrentUser(userId: number): boolean {
        return this._authService.getCurrentUserId() === userId;
    }

    onNewCommentInput(): void {
        setTimeout(() => this._updateMentionDropdown(), 0);
    }

    onCommentInputBlur(): void {
        setTimeout(() => this._closeMentionDropdown(), 200);
    }

    setCommentHistoryTab(tab: string): void {
        this.commentHistoryTab = tab as 'comments' | 'history';
        if (this.commentHistoryTab === 'history') this._loadCommentHistory();
    }

    getHistoryActionLabel(action: string): string {
        switch (action) {
            case 'created': return 'Added comment';
            case 'updated': return 'Edited comment';
            case 'deleted': return 'Deleted comment';
            default: return action;
        }
    }

    getFieldHistoryLabel(field: string): string {
        switch (field?.toLowerCase()) {
            case 'status': return 'Status';
            case 'priority': return 'Priority';
            case 'assigned_to_user_id': return 'Assigned to';
            case 'system': return 'System';
            default: return field;
        }
    }

    private _loadCommentHistory(): void {
        if (!this.todo) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this.loadingHistory = true;
        this._todoService.getTodoHistory(userId, this.todo.id).subscribe({
            next: (res) => {
                this.commentHistory = res.history ?? [];
                this.loadingHistory = false;
                this._cdr.markForCheck();
            },
            error: () => {
                this.commentHistory = [];
                this.loadingHistory = false;
                this._cdr.markForCheck();
            },
        });
    }

    onNewCommentKeydown(event: KeyboardEvent): void {
        if (!this.showMentionDropdown) return;
        const list = this.mentionableUsersFiltered;
        if (event.key === 'Escape') {
            this._closeMentionDropdown();
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowDown') {
            this.highlightedMentionIndex = Math.min(this.highlightedMentionIndex + 1, list.length - 1);
            this._cdr.markForCheck();
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowUp') {
            this.highlightedMentionIndex = Math.max(this.highlightedMentionIndex - 1, 0);
            this._cdr.markForCheck();
            event.preventDefault();
            return;
        }
        if (event.key === 'Enter' && list.length > 0) {
            const user = list[this.highlightedMentionIndex];
            if (user) {
                this._selectMention(user);
                event.preventDefault();
            }
        }
    }

    selectMention(user: IUserListResponse): void {
        this._selectMention(user);
    }

    private _updateMentionDropdown(): void {
        const el = this.newCommentInputRef?.nativeElement;
        const text = this.newCommentText ?? '';
        const start = el?.selectionStart ?? text.length;
        const beforeCursor = text.substring(0, start);
        const atIdx = beforeCursor.lastIndexOf('@');
        if (atIdx === -1) {
            this._closeMentionDropdown();
            return;
        }
        const afterAt = beforeCursor.substring(atIdx + 1);
        if (/\s/.test(afterAt)) {
            this._closeMentionDropdown();
            return;
        }
        this.mentionStartIndex = atIdx;
        this.mentionFilter = afterAt;
        this.showMentionDropdown = true;
        this.highlightedMentionIndex = 0;
        this._cdr.markForCheck();
    }

    private _closeMentionDropdown(): void {
        this.showMentionDropdown = false;
        this.mentionFilter = '';
        this.mentionStartIndex = -1;
        this.highlightedMentionIndex = 0;
        this._cdr.markForCheck();
    }

    private _selectMention(user: IUserListResponse): void {
        const el = this.newCommentInputRef?.nativeElement;
        const text = this.newCommentText ?? '';
        const end = el?.selectionEnd ?? text.length;
        const before = text.substring(0, this.mentionStartIndex);
        const after = text.substring(end);
        const insert = `@${user.username} `;
        this.newCommentText = before + insert + after;
        this.mentionedUserIdsInComment = [...this.mentionedUserIdsInComment, user.id];
        this._closeMentionDropdown();
        this._cdr.markForCheck();
        setTimeout(() => {
            const newPos = this.mentionStartIndex + insert.length;
            el?.focus();
            el?.setSelectionRange(newPos, newPos);
        }, 0);
    }

    onAddComment(): void {
        const content = this.newCommentText?.trim();
        if ((!content && !this.selectedFile) || !this.todo) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this.addingComment = true;
        const mentionedIds = this.mentionedUserIdsInComment.length > 0 ? [...this.mentionedUserIdsInComment] : undefined;
        this._todoService.addTodoComment(userId, this.todo.id, content || '', mentionedIds, this.selectedFile || undefined).subscribe({
            next: (comment) => {
                this.comments = [...this.comments, comment];
                this.newCommentText = '';
                this.mentionedUserIdsInComment = [];
                this.removeSelectedFile();
                this.addingComment = false;
                if (this.commentHistoryTab === 'history') this._loadCommentHistory();
                this._toastService.success('Comment added');
            },
            error: (err) => {
                this.addingComment = false;
                this._toastService.error(err?.error?.detail || 'Failed to add comment');
            },
        });
    }

    onFileSelected(event: any): void {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                this._toastService.error('File size must be less than 10MB');
                return;
            }
            this.selectedFile = file;
            if (this.isImage(file.name)) {
                this.previewSelectedUrl = URL.createObjectURL(file);
            } else {
                this.previewSelectedUrl = null;
            }
        }
    }

    removeSelectedFile(): void {
        if (this.previewSelectedUrl) {
            URL.revokeObjectURL(this.previewSelectedUrl);
        }
        this.selectedFile = null;
        this.previewSelectedUrl = null;
    }

    onStartEditComment(comment: ITodoComment): void {
        this.editingCommentId = comment.id;
        this.editContent = comment.content;
        this.editAttachmentUrl = comment.attachment_url || null;
        this.shouldDeleteAttachment = false;
    }

    onCancelEditComment(): void {
        this.editingCommentId = null;
        this.editContent = '';
        this.editAttachmentUrl = null;
        this.shouldDeleteAttachment = false;
    }

    removeEditAttachment(): void {
        this.editAttachmentUrl = null;
        this.shouldDeleteAttachment = true;
    }

    onSaveEditComment(): void {
        if (!this.todo || this.editingCommentId == null) return;
        const content = this.editContent?.trim();
        if (!content && this.shouldDeleteAttachment && !this.editAttachmentUrl) {
            return;
        }
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this.savingEdit = true;
        this._todoService.updateTodoComment(userId, this.todo.id, this.editingCommentId, content || '', this.shouldDeleteAttachment).subscribe({
            next: (updated) => {
                this.comments = this.comments.map((c) => (c.id === updated.id ? updated : c));
                this.onCancelEditComment();
                this.savingEdit = false;
                if (this.commentHistoryTab === 'history') this._loadCommentHistory();
                this._toastService.success('Comment updated');
            },
            error: (err) => {
                this.savingEdit = false;
                this._toastService.error(err?.error?.detail || 'Failed to update comment');
            },
        });
    }

    onDeleteComment(comment: ITodoComment): void {
        if (!this.todo) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this._confirmationDialog.show({
            title: 'Delete comment',
            message: 'Are you sure you want to delete this comment?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            confirmButtonClass: 'btn-danger',
        }).pipe(takeUntil(this._destroy$)).subscribe((result) => {
            if (!result.confirmed) return;
            this.deletingCommentId = comment.id;
            this._todoService.deleteTodoComment(userId, this.todo!.id, comment.id).subscribe({
                next: () => {
                    this.comments = this.comments.filter((c) => c.id !== comment.id);
                    this.deletingCommentId = null;
                    if (this.commentHistoryTab === 'history') this._loadCommentHistory();
                    this._toastService.success('Comment deleted');
                },
                error: (err) => {
                    this.deletingCommentId = null;
                    this._toastService.error(err?.error?.detail || 'Failed to delete comment');
                },
            });
        });
    }

    onSave(): void {
        if (!this.todo) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this.saving = true;
        this._todoService.updateTodo(userId, this.todo.id, {
            status: this.todo.status,
            priority: this.todo.priority,
            description: this.todo.description ?? undefined,
            assigned_to_user_id: this.todo.assigned_to_user_id ?? null,
            due_date: this.todoDueDate || null,
        }).subscribe({
            next: (updated) => {
                this.todo = {
                    ...this.todo!,
                    status: updated.status as TodoStatus,
                    priority: updated.priority as 'low' | 'medium' | 'high',
                    description: updated.description ?? this.todo!.description,
                    assigned_to_user_id: updated.assigned_to_user_id ?? undefined,
                    assigned_to_username: updated.assigned_to_username ?? this.todo!.assigned_to_username,
                    due_date: updated.due_date,
                    updated_at: updated.updated_at,
                };
                this.initialStatus = this.todo.status;
                this.initialPriority = this.todo.priority;
                this.initialDescription = this.todo.description ?? null;
                this.initialAssignedToUserId = this.todo.assigned_to_user_id ?? null;
                this.initialDueDate = this.todo.due_date ? this.todo.due_date.split('T')[0] : null;
                this.todoDueDate = this.initialDueDate || '';
                this.saving = false;
                if (this.commentHistoryTab === 'history') this._loadCommentHistory();
                this._toastService.success('Todo updated');
            },
            error: (err) => {
                this.saving = false;
                this._toastService.error(err?.error?.detail || 'Failed to update todo');
            },
        });
    }

    onDueDateChange(newDate: string): void {
        this.todoDueDate = newDate;
        this._cdr.markForCheck();
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

    getPriorityIcon(priority: string): string {
        switch (priority) {
            case 'high': return 'bi-arrow-up';
            case 'low': return 'bi-arrow-down';
            default: return 'bi-dash';
        }
    }

    formatDate(dateString?: string): { date: string; time: string } | null {
        if (!dateString) return null;
        const date = new Date(dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)
            ? dateString
            : dateString.replace('T', ' '));
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const formattedTime = `${hours}:${minutes} ${ampm}`;
        return { date: formattedDate, time: formattedTime };
    }
}
