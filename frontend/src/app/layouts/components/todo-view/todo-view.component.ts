import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, OnInit, OnDestroy, ViewChild, HostListener } from "@angular/core";
import { FormsModule, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Observable, Subject } from "rxjs";
import { map, takeUntil } from "rxjs/operators";
import { AuthService } from "../../../auth/services/auth.service";
import { UserService } from "../../../core/services/user.service";
import { TodoService } from "../../../core/services/todo.service";
import { ImageUploadService } from "../../../core/services/image-upload.service";
import { IUserListResponse } from "../../../auth/interfaces";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { ITodo, ITodoComment, ITodoHistoryEntry, ITodoUpdate, TodoStatus } from "../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { CanComponentDeactivate } from "../../../auth/guards";
import { ParseMentionsPipe } from "../../../core/pipes/parse-mentions.pipe";
import { TabsComponent, ITabItem } from "../../../shared/components/tabs";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { NavigationService } from "../../../core/services/navigation.service";
import { PosthogService } from "../../../core/services/posthog.service";
import { DropdownFormComponent } from "../../../shared/components/form-fields/dropdown/dropdown.component";
import { DatePickerComponent } from "../../../shared/components/form-fields/date-picker/date-picker.component";
import { InputFormComponent } from "../../../shared/components/form-fields/input/input.component";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { IFieldControl } from "../../../shared/interfaces";
import { InputTypes, ValidatorTypes } from "../../../shared/enums";

import { DynamicFormComponent } from "../../../shared/components/dynamic-form/dynamic-form.component";
import { PasteImageDirective } from "../../../shared/directives/paste-image.directive";
import { ProgressBarComponent } from "../../../shared/components/progress-bar/progress-bar.component";

@Component({
    selector: 'app-todo-view',
    templateUrl: './todo-view.component.html',
    styleUrls: ['./todo-view.component.scss'],
    standalone: true,
    imports: [
        CommonModule, 
        FormsModule, 
        ReactiveFormsModule,
        ParseMentionsPipe, 
        TabsComponent,
        DropdownFormComponent,
        DynamicFormComponent,
        PasteImageDirective,
        ProgressBarComponent
    ],
})
export class TodoViewComponent implements OnInit, OnDestroy, CanComponentDeactivate {
    private readonly _destroy$ = new Subject<void>();
    todo: ITodo | null = null;
    saving = false;
    isCommentImageUploading = false;
    
    todoForm: FormGroup = new FormGroup({});
    logTimeForm: FormGroup = new FormGroup({});
    
    assigneeField: IFieldControl = {
        label: 'Assignee',
        type: InputTypes.DROPDOWN,
        formControlName: 'assigned_to_user_id',
        placeholder: 'Unassigned',
        value: null,
        options: [],
        validations: []
    };

    statusField: IFieldControl = {
        label: 'Status',
        type: InputTypes.DROPDOWN,
        formControlName: 'status',
        placeholder: 'Select Status',
        value: 'new',
        options: [
            { value: 'New', key: 'new' },
            { value: 'In Progress', key: 'inProgress' },
            { value: 'Paused', key: 'paused' },
            { value: 'Done', key: 'done' }
        ],
        validations: []
    };

    priorityField: IFieldControl = {
        label: 'Priority',
        type: InputTypes.DROPDOWN,
        formControlName: 'priority',
        placeholder: 'Select Priority',
        value: 'medium',
        options: [
            { value: 'Low', key: 'low' },
            { value: 'Medium', key: 'medium' },
            { value: 'High', key: 'high' }
        ],
        validations: []
    };

    descriptionField: IFieldControl = {
        formControlName: 'description',
        label: 'Description',
        type: InputTypes.TEXTAREA,
        value: '',
        validations: [],
        imagePreviewMode: 'filmstrip',
        disableInternalLightbox: true,
        showAttachHint: true
    };

    dueDateField: IFieldControl = {
        formControlName: 'due_date',
        label: 'Due Date',
        type: InputTypes.DATE,
        value: '',
        validations: []
    };

    timeEstimateField: IFieldControl = {
        formControlName: 'time_estimate',
        label: 'Time Estimate',
        type: InputTypes.TIME_ESTIMATE,
        value: '',
        validations: []
    };

    timeLoggedField: IFieldControl = {
        formControlName: 'time_logged',
        label: 'Log Time',
        type: InputTypes.TIME_ESTIMATE,
        value: '',
        validations: []
    };

    logTimeField: IFieldControl = {
        formControlName: 'time_to_log',
        label: 'Log Time',
        type: InputTypes.TIME_ESTIMATE,
        value: '',
        validations: []
    };

    initialFormValue: any = null;
    
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
    previewCarouselIndex: number = 0;
    editAttachmentUrl: string | null = null;
    shouldDeleteAttachment: boolean = false;
    selectedEditFile: File | null = null;
    previewEditSelectedUrl: string | null = null;
    isExtrasMenuOpen: boolean = false;
    showEmojiPicker: boolean = false;
    readonly commonEmojis = ['😊', '👍', '❤️', '🔥', '😂', '😮', '😢', '✅', '🚀', '✨', '🙏', '💯'];
    InputTypes = InputTypes;
    descriptionPreviewOpen = false;

    readonly commentHistoryTabs: ITabItem[] = [
        { id: 'comments', label: 'Comments', icon: 'bi-chat-left-text' },
        { id: 'history', label: 'History', icon: 'bi-clock-history' },
    ];
    LayoutPaths = LayoutPaths;
    @ViewChild('newCommentInput') newCommentInputRef?: ElementRef<HTMLTextAreaElement>;

    get mentionableUsersFiltered(): IUserListResponse[] {
        const q = (this.mentionFilter || '').toLowerCase();
        if (!q) return this.mentionableUsers;
        return this.mentionableUsers.filter((u) => (u.username || '').toLowerCase().includes(q));
    }

    get isAdmin(): boolean {
        return this._authService.isAdmin();
    }

    get hasChanges(): boolean {
        if (!this.todo || !this.initialFormValue) return false;
        const currentFormValue = this.todoForm.value;
        const hasTodoChanges = JSON.stringify(currentFormValue) !== JSON.stringify(this.initialFormValue);
        const hasTimeLogChanges = !!this.logTimeForm.get('time_to_log')?.value;
        return hasTodoChanges || hasTimeLogChanges;
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
        private readonly _navService: NavigationService,
        private readonly _posthogService: PosthogService,
        private readonly _formService: ReactiveFormService,
        private readonly _imageUploadService: ImageUploadService
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

        // Set required status based on admin role
        if (!this.isAdmin) {
            this.assigneeField.required = true;
            this.assigneeField.validations = [
                { type: ValidatorTypes.REQUIRED, message: 'Assignee is required' }
            ];
        }

        this.todoForm = this._formService.initializeForm([
            this.assigneeField,
            this.statusField,
            this.priorityField,
            this.descriptionField,
            this.dueDateField,
            this.timeEstimateField,
            this.timeLoggedField
        ]);

        this.logTimeForm = this._formService.initializeForm([
            this.logTimeField
        ]);

        this._loaderService.show();
        this._todoService.getTodo(userId, todoId).subscribe({
            next: (response) => {
                this.todo = response as ITodo;

                const formValue = {
                    assigned_to_user_id: this.todo.assigned_to_user_id || null,
                    status: this.todo.status || 'new',
                    priority: this.todo.priority || 'medium',
                    description: this.todo.description || '',
                    due_date: this.todo.due_date ? this.todo.due_date.split('T')[0] : '',
                    time_estimate: this.todo.time_estimate || '',
                    time_logged: this.todo.time_logged || ''
                };

                this.todoForm.patchValue(formValue);
                this.initialFormValue = { ...formValue };                
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

    toggleExtrasMenu(): void {
        this.isExtrasMenuOpen = !this.isExtrasMenuOpen;
        if (!this.isExtrasMenuOpen) {
            this.showEmojiPicker = false;
        }
    }

    toggleEmojiPicker(): void {
        this.showEmojiPicker = !this.showEmojiPicker;
    }

    addEmoji(emoji: string, isEdit: boolean = false): void {
        if (isEdit) {
            this.editContent = (this.editContent ?? '') + emoji;
        } else {
            this.newCommentText = (this.newCommentText ?? '') + emoji;
        }
        this.showEmojiPicker = false;
    }

    isImage(filename?: string | null): boolean {
        if (!filename) return false;
        const ext = filename.split('.').pop()?.toLowerCase();
        return !!ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    }

    get allImageUrls(): string[] {
        const urls: string[] = [];
        
        // Add images from current description (form value)
        const currentDescription = this.todoForm.get('description')?.value || this.todo?.description;
        if (currentDescription) {
            urls.push(...this._extractImageUrls(currentDescription));
        }

        // Add images from comments
        this.comments.forEach(c => {
            // From markdown in content
            const mdUrls = this._extractImageUrls(c.content);
            urls.push(...mdUrls);
            
            // From file attachment
            if (c.attachment_url && this.isImage(c.attachment_name)) {
                urls.push(c.attachment_url);
            }
        });
        
        return [...new Set(urls)];
    }

    openPreview(url: string, name: string, event?: MouseEvent): void {
        if (event && event.preventDefault) {
            event.preventDefault();
        }
        this.previewAttachmentUrl = url;
        this.previewAttachmentName = name;
        
        const allUrls = this.allImageUrls;
        this.previewCarouselIndex = allUrls.indexOf(url);
        if (this.previewCarouselIndex === -1) {
            this.previewCarouselIndex = 0;
        }
        this._setBodyScrollLock(true);
    }

    closePreview(): void {
        this.previewAttachmentUrl = null;
        this.previewAttachmentName = null;
        this._setBodyScrollLock(false);
    }

    downloadImage(url: string | null, filename: string | null): void {
        if (!url) return;
        
        const name = filename || 'downloaded-image';
        
        fetch(url)
            .then(response => response.blob())
            .then(blob => {
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
            })
            .catch(err => {
                console.error('Download failed:', err);
                // Fallback: try opening in new tab if fetch fails
                window.open(url, '_blank');
            });
    }

    prevPreview(): void {
        const urls = this.allImageUrls;
        if (this.previewCarouselIndex > 0) {
            this.previewCarouselIndex--;
            this.previewAttachmentUrl = urls[this.previewCarouselIndex];
            this.previewAttachmentName = 'Image';
        }
    }

    nextPreview(): void {
        const urls = this.allImageUrls;
        if (this.previewCarouselIndex < urls.length - 1) {
            this.previewCarouselIndex++;
            this.previewAttachmentUrl = urls[this.previewCarouselIndex];
            this.previewAttachmentName = 'Image';
        }
    }

    private _setBodyScrollLock(lock: boolean): void {
        const overflow = lock ? 'hidden' : '';
        document.documentElement.style.overflow = overflow;
        document.body.style.overflow = overflow;
    }

    private _loadMentionableUsers(): void {
        this._userService.getMentionableUsers().subscribe({
            next: (list) => { 
                this.mentionableUsers = list; 
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
                
                const userOptions = this.mentionableUsers.map(u => ({ key: u.id, value: u.username }));
                
                if (this.isAdmin) {
                    this.assigneeField.options = [
                        { key: null, value: 'Unassigned' },
                        ...userOptions
                    ];
                } else {
                    this.assigneeField.options = userOptions;
                }
            },
            error: () => { this.mentionableUsers = []; },
        });
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

    onCommentAttachClick(): void {
        const input = document.getElementById('comment-file-input') as HTMLInputElement;
        input?.click();
    }

    onCommentFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this._toastService.error('Only image files are allowed');
            return;
        }

        this.isCommentImageUploading = true;
        this._imageUploadService.uploadImage(file).subscribe({
            next: (url: string) => {
                this.isCommentImageUploading = false;
                const currentText = this.newCommentText || '';
                this.newCommentText = currentText ? `${currentText}\n![image](${url})` : `![image](${url})`;
                input.value = '';
            },
            error: (err) => {
                this.isCommentImageUploading = false;
                this._toastService.error(err?.error?.detail || 'Failed to upload image');
                input.value = '';
            }
        });
    }

    onEditCommentAttachClick(commentId: number): void {
        const input = document.getElementById(`edit-comment-file-input-${commentId}`) as HTMLInputElement;
        input?.click();
    }

    onEditCommentFileSelected(event: Event, commentId: number): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this._toastService.error('Only image files are allowed');
            return;
        }

        this.isCommentImageUploading = true;
        this._imageUploadService.uploadImage(file).subscribe({
            next: (url: string) => {
                this.isCommentImageUploading = false;
                const currentText = this.editContent || '';
                this.editContent = currentText ? `${currentText}\n![image](${url})` : `![image](${url})`;
                input.value = '';
            },
            error: (err) => {
                this.isCommentImageUploading = false;
                this._toastService.error(err?.error?.detail || 'Failed to upload image');
                input.value = '';
            }
        });
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

    stripImageMarkdown(text: string | null | undefined): string {
        if (!text) return '';
        return text.replace(/\n?!\[image\]\([^)]+\)/g, '').trimEnd();
    }

    get newCommentImageUrls(): string[] {
        return this._extractImageUrls(this.newCommentText);
    }

    get editCommentImageUrls(): string[] {
        return this._extractImageUrls(this.editContent);
    }

    private _extractImageUrls(value: string): string[] {
        if (!value) return [];
        const regex = /!\[image\]\(([^)]+)\)/g;
        const urls: string[] = [];
        let match;
        while ((match = regex.exec(value)) !== null) {
            urls.push(match[1]);
        }
        return urls;
    }

    removeImageFromNewComment(url: string): void {
        this.newCommentText = this._removeImageFromText(this.newCommentText, url);
    }

    removeImageFromEditComment(url: string): void {
        this.editContent = this._removeImageFromText(this.editContent, url);
    }

    private _removeImageFromText(text: string, url: string): string {
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`\\n?!\\[image\\]\\(${escaped}\\)`, 'g'), '');
    }

    onNewCommentVisibleInput(event: Event): void {
        const el = event.target as HTMLTextAreaElement;
        const textPart = el.value;
        const imageUrls = this._extractImageUrls(this.newCommentText);
        
        const pastedUrls: string[] = [];
        const imgRegex = /!\[image\]\(([^)]+)\)/g;
        let m;
        while ((m = imgRegex.exec(textPart)) !== null) {
            pastedUrls.push(m[1]);
        }
        
        if (pastedUrls.length > 0) {
            const cleanText = textPart.replace(/\n?!\[image\]\([^)]+\)/g, '');
            const allUrls = [...new Set([...imageUrls, ...pastedUrls])];
            const imagePart = allUrls.length > 0 ? '\n' + allUrls.map(u => `![image](${u})`).join('\n') : '';
            this.newCommentText = cleanText + imagePart;
            el.value = cleanText;
        } else {
            const imagePart = imageUrls.length > 0 ? '\n' + imageUrls.map(u => `![image](${u})`).join('\n') : '';
            this.newCommentText = textPart + imagePart;
        }
    }

    onEditCommentVisibleInput(event: Event): void {
        const el = event.target as HTMLTextAreaElement;
        const textPart = el.value;
        const imageUrls = this._extractImageUrls(this.editContent);
        
        const pastedUrls: string[] = [];
        const imgRegex = /!\[image\]\(([^)]+)\)/g;
        let m;
        while ((m = imgRegex.exec(textPart)) !== null) {
            pastedUrls.push(m[1]);
        }
        
        if (pastedUrls.length > 0) {
            const cleanText = textPart.replace(/\n?!\[image\]\([^)]+\)/g, '');
            const allUrls = [...new Set([...imageUrls, ...pastedUrls])];
            const imagePart = allUrls.length > 0 ? '\n' + allUrls.map(u => `![image](${u})`).join('\n') : '';
            this.editContent = cleanText + imagePart;
            el.value = cleanText;
        } else {
            const imagePart = imageUrls.length > 0 ? '\n' + imageUrls.map(u => `![image](${u})`).join('\n') : '';
            this.editContent = textPart + imagePart;
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
        if (this.previewEditSelectedUrl) {
            URL.revokeObjectURL(this.previewEditSelectedUrl);
        }
        this.selectedEditFile = null;
        this.previewEditSelectedUrl = null;
    }

    onEditFileSelected(event: any): void {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                this._toastService.error('File size must be less than 10MB');
                return;
            }
            this.selectedEditFile = file;
            if (this.isImage(file.name)) {
                this.previewEditSelectedUrl = URL.createObjectURL(file);
            } else {
                this.previewEditSelectedUrl = null;
            }
        }
    }

    removeEditAttachment(): void {
        if (this.previewEditSelectedUrl) {
            URL.revokeObjectURL(this.previewEditSelectedUrl);
        }
        this.editAttachmentUrl = null;
        this.selectedEditFile = null;
        this.previewEditSelectedUrl = null;
        this.shouldDeleteAttachment = true;
    }

    onSaveEditComment(): void {
        if (!this.todo || this.editingCommentId == null) return;
        const content = this.editContent?.trim();
        if (!content && this.shouldDeleteAttachment && !this.selectedEditFile) {
            return;
        }
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this.savingEdit = true;
        this._todoService.updateTodoComment(
            userId, 
            this.todo.id, 
            this.editingCommentId, 
            content || '', 
            this.shouldDeleteAttachment,
            this.selectedEditFile || undefined
        ).subscribe({
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
        
        const formValue = this.todoForm.value;
        const timeToLog = this.logTimeForm.get('time_to_log')?.value;

        let finalTimeLogged = formValue.time_logged;
        if (timeToLog) {
            const currentMinutes = this._parseTimeToMinutes(formValue.time_logged);
            const extraMinutes = this._parseTimeToMinutes(timeToLog);
            finalTimeLogged = this._formatMinutesToTime(currentMinutes + extraMinutes);
        }

        this.saving = true;
        
        const updatePayload: ITodoUpdate = {
            status: formValue.status,
            priority: formValue.priority,
            description: formValue.description,
            assigned_to_user_id: formValue.assigned_to_user_id,
            due_date: formValue.due_date || null,
            time_estimate: formValue.time_estimate || null,
            time_logged: finalTimeLogged || null
        };

        this._todoService.updateTodo(userId, this.todo.id, updatePayload).subscribe({
            next: (updated) => {
                this.todo = {
                    ...this.todo!,
                    ...updated
                } as ITodo;

                const newFormValue = {
                    assigned_to_user_id: this.todo.assigned_to_user_id || null,
                    status: this.todo.status || 'new',
                    priority: this.todo.priority || 'medium',
                    description: this.todo.description || '',
                    due_date: this.todo.due_date ? this.todo.due_date.split('T')[0] : '',
                    time_estimate: this.todo.time_estimate || '',
                    time_logged: this.todo.time_logged || ''
                };
                
                this.initialFormValue = { ...newFormValue };
                this.todoForm.reset(newFormValue);
                this.logTimeForm.reset({ time_to_log: '' });
                
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

    onDeleteTodo(): void {
        if (!this.todo) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._confirmationDialog.show({
            title: 'Delete Todo',
            message: `Are you sure you want to delete "${this.todo.title}"? This action cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            confirmButtonClass: 'btn-danger'
        })
        .pipe(takeUntil(this._destroy$))
        .subscribe(result => {
            if (result.confirmed) {
                this._loaderService.show();
                this._todoService.deleteTodo(userId, this.todo!.id).subscribe({
                    next: (response) => {
                        this._loaderService.hide();
                        this._toastService.success(response?.message || 'Todo deleted successfully');
                        this._posthogService.capture('todo_deleted', { todo_id: this.todo?.id });
                        this._router.navigate([LayoutPaths.DASHBOARD]);
                    },
                    error: (error) => {
                        this._toastService.error(error?.error?.detail || 'Failed to delete todo');
                        this._loaderService.hide();
                    }
                });
            }
        });
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

    private _parseTimeToMinutes(time: string | null): number {
        if (!time) return 0;
        const wMatch = time.match(/(\d+)w/i);
        const dMatch = time.match(/(\d+)d/i);
        const hMatch = time.match(/(\d+)h/i);
        const mMatch = time.match(/(\d+)m/i);
        
        const weeks = wMatch ? parseInt(wMatch[1], 10) : 0;
        const days = dMatch ? parseInt(dMatch[1], 10) : 0;
        const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
        const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
        
        return (weeks * 5 * 8 * 60) + (days * 8 * 60) + (hours * 60) + minutes;
    }

    private _formatMinutesToTime(totalMinutes: number): string {
        if (totalMinutes <= 0) return '';
        
        const minutesInWeek = 5 * 8 * 60;
        const minutesInDay = 8 * 60;
        const minutesInHour = 60;
        
        let remaining = totalMinutes;
        const weeks = Math.floor(remaining / minutesInWeek);
        remaining %= minutesInWeek;
        
        const days = Math.floor(remaining / minutesInDay);
        remaining %= minutesInDay;
        
        const hours = Math.floor(remaining / minutesInHour);
        remaining %= minutesInHour;
        
        const minutes = remaining;
        
        let result = '';
        if (weeks > 0) result += `${weeks}w `;
        if (days > 0) result += `${days}d `;
        if (hours > 0) result += `${hours}h `;
        if (minutes > 0) result += `${minutes}m`;
        
        return result.trim();
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
}
