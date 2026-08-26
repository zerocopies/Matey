import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';

export const addDiffEffect = StateEffect.define();
export const clearDiffEffect = StateEffect.define();

const additionMark = Decoration.line({ class: 'bg-green-900/30 border-l-4 border-green-500 text-green-200' });
const deletionMark = Decoration.line({ class: 'bg-red-900/30 border-l-4 border-red-500 text-red-200 line-through' });

export const diffField = StateField.define({
  create() { return Decoration.none; },
  update(diffs, tr) {
    diffs = diffs.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(addDiffEffect)) {
        const builder = [];
        const doc = tr.state.doc;
        const startLine = Math.max(1, e.value.fromLine);
        const endLine = Math.min(e.value.toLine, doc.lines);
        
        for (let i = startLine; i <= endLine; i++) {
          const line = doc.line(i);
          const mark = e.value.type === 'add' ? additionMark : deletionMark;
          builder.push(mark.range(line.from));
        }
        diffs = diffs.update({ add: builder });
      } else if (e.is(clearDiffEffect)) {
        diffs = Decoration.none;
      }
    }
    return diffs;
  },
  provide: (f) => EditorView.decorations.from(f),
});
