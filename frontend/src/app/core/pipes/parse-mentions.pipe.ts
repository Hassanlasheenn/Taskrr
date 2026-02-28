import { Pipe, PipeTransform } from "@angular/core";

export type CommentSegment = { type: 'text' | 'mention'; value: string };

@Pipe({
    name: 'parseMentions',
    standalone: true,
})
export class ParseMentionsPipe implements PipeTransform {
    transform(content: string | undefined): CommentSegment[] {
        if (content == null || content === '') return [];
        const parts = content.split(/(@\w+)/g);
        return parts
            .map((p): CommentSegment => {
                if (p.startsWith('@')) {
                    return { type: 'mention', value: p };
                }
                return { type: 'text', value: p };
            })
            .filter((seg) => seg.value.length > 0);
    }
}
