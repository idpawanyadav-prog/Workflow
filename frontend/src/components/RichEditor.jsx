import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Underline } from '@tiptap/extension-underline';
import { Icon } from './Icon';

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  Image,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
];

export default function RichEditor({ value, onChange, autoFocus = false }) {
  const editor = useEditor({
    extensions,
    content: value || { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: {
        class: 'ws-prose',
        'data-testid': 'rich-editor',
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
  });

  useEffect(() => {
    if (editor && value && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.updatedAt]);

  useEffect(() => {
    if (autoFocus && editor) setTimeout(() => editor.commands.focus('end'), 100);
  }, [autoFocus, editor]);

  if (!editor) return null;

  const Btn = ({ onClick, active, icon, label, testId }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      data-testid={testId}
      style={{
        width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--ws-border-subtle)',
        background: active ? 'var(--ws-text)' : 'var(--ws-surface)',
        color: active ? 'var(--ws-bg)' : 'var(--ws-text)',
        borderRadius: 6, cursor: 'pointer',
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );

  const setLink = () => {
    const previous = editor.getAttributes('link').href;
    const url = window.prompt('URL', previous || 'https://');
    if (url === null) return;
    if (url === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt('Image URL');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: 8, border: '1px solid var(--ws-border-subtle)', borderRadius: 6,
        background: 'var(--ws-surface-raised)', position: 'sticky', top: 0, zIndex: 2,
      }}>
        <Btn testId="editor-bold" icon="Bold" label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Btn testId="editor-italic" icon="Italic" label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Btn testId="editor-underline" icon="Underline" label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <span style={{ width: 1, background: 'var(--ws-border-subtle)', margin: '0 4px' }} />
        <Btn testId="editor-h1" icon="Heading1" label="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <Btn testId="editor-h2" icon="Heading2" label="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <Btn testId="editor-h3" icon="Heading3" label="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <span style={{ width: 1, background: 'var(--ws-border-subtle)', margin: '0 4px' }} />
        <Btn testId="editor-bullet" icon="List" label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Btn testId="editor-ordered" icon="ListOrdered" label="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Btn testId="editor-check" icon="ListChecks" label="Checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
        <span style={{ width: 1, background: 'var(--ws-border-subtle)', margin: '0 4px' }} />
        <Btn testId="editor-quote" icon="Quote" label="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <Btn testId="editor-code" icon="Code2" label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <Btn testId="editor-link" icon="Link" label="Link" active={editor.isActive('link')} onClick={setLink} />
        <Btn testId="editor-image" icon="Image" label="Image" onClick={addImage} />
        <Btn
          testId="editor-table"
          icon="Table"
          label="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
      </div>
      <div className="scrollbar-thin" style={{
        flex: 1, overflow: 'auto', padding: 16,
        border: '1px solid var(--ws-border-subtle)', borderRadius: 6,
        background: 'var(--ws-surface)',
      }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
