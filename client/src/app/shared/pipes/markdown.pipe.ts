import { Pipe, type PipeTransform } from '@angular/core';
import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    return marked.parse(value, { async: false }) as string;
  }
}
