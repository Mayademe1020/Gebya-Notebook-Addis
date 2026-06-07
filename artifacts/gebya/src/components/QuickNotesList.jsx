import { CheckCircle2, Pencil, Plus, RotateCw, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { isPendingQuickNote, quickNoteTypeLabel } from '../utils/quickNotes';

function QuickNotesList({
  notes = [],
  dueToday = [],
  overdue = [],
  onAddNote,
  onEditNote,
  onDoneNote,
  onDismissNote,
  onConvertToDubie,
  onOpenCredit,
}) {
  const { lang } = useLang();
  const pendingNotes = notes
    .filter((note) => isPendingQuickNote(note) && !note.due_date)
    .slice(0, 3);
  const dueItems = dueToday.slice(0, 4);
  const overdueItems = overdue.slice(0, 4);
  const hasActions = dueItems.length > 0 || overdueItems.length > 0 || pendingNotes.length > 0;

  return (
    <section
      className="space-y-3"
      style={{ background: '#fff', border: '1px solid #ece6d6', borderRadius: 12, padding: 12 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
            Today memory
          </p>
          <h3 className="text-base font-black truncate" style={{ color: '#1a1a1a' }}>
            What should not be forgotten?
          </h3>
        </div>
        <button
          type="button"
          onClick={onAddNote}
          className="press-scale flex items-center justify-center gap-1.5"
          style={{
            background: '#1B4332',
            color: '#fff',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            minHeight: 40,
            fontSize: '0.78rem',
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          <Plus className="w-4 h-4" />
          Note
        </button>
      </div>

      {!hasActions && (
        <div style={{ background: '#faf9f7', borderRadius: 10, padding: '12px 14px' }}>
          <p className="text-sm font-semibold" style={{ color: '#374151' }}>
            Nothing urgent saved for today.
          </p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            Save a messy note now and organize it later.
          </p>
        </div>
      )}

      {overdueItems.length > 0 && (
        <ActionGroup
          title="Overdue"
          items={overdueItems}
          tone="danger"
          onOpenCredit={onOpenCredit}
          onEditNote={onEditNote}
          onDoneNote={onDoneNote}
          onDismissNote={onDismissNote}
          onConvertToDubie={onConvertToDubie}
          lang={lang}
        />
      )}

      {dueItems.length > 0 && (
        <ActionGroup
          title="Due today"
          items={dueItems}
          tone="warning"
          onOpenCredit={onOpenCredit}
          onEditNote={onEditNote}
          onDoneNote={onDoneNote}
          onDismissNote={onDismissNote}
          onConvertToDubie={onConvertToDubie}
          lang={lang}
        />
      )}

      {pendingNotes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
            Pending notes
          </p>
          {pendingNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onEditNote={onEditNote}
              onDoneNote={onDoneNote}
              onDismissNote={onDismissNote}
              onConvertToDubie={onConvertToDubie}
              lang={lang}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionGroup({ title, items, tone, onOpenCredit, onEditNote, onDoneNote, onDismissNote, onConvertToDubie, lang }) {
  const isDanger = tone === 'danger';
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isDanger ? '#dc2626' : '#b45309' }}>
        {title}
      </p>
      {items.map((item) => (
        item.action_kind === 'quick_note' ? (
          <NoteRow
            key={`note-${item.id}`}
            note={item}
            tone={tone}
            onEditNote={onEditNote}
            onDoneNote={onDoneNote}
            onDismissNote={onDismissNote}
            onConvertToDubie={onConvertToDubie}
            lang={lang}
          />
        ) : (
          <DubieRow
            key={`dubie-${item.customer_id}-${item.transaction_id || item.due_date}`}
            item={item}
            tone={tone}
            onOpenCredit={onOpenCredit}
          />
        )
      ))}
    </div>
  );
}

function DubieRow({ item, tone, onOpenCredit }) {
  const isDanger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onOpenCredit}
      className="w-full text-left press-scale"
      style={{
        padding: '9px 10px',
        borderRadius: 10,
        background: isDanger ? '#fef2f2' : '#fffbeb',
        border: `1px solid ${isDanger ? '#fecaca' : '#fde68a'}`,
      }}
    >
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#1f2937' }}>{item.customer_name}</p>
          <p className="text-[11px]" style={{ color: '#6b7280' }}>Dubie</p>
        </div>
        <p className="text-sm font-black" style={{ color: isDanger ? '#dc2626' : '#b45309' }}>{item.amount} birr</p>
      </div>
      {item.note && <p className="text-[11px] truncate" style={{ color: '#6b7280' }}>{item.note}</p>}
    </button>
  );
}

function NoteRow({ note, tone, onEditNote, onDoneNote, onDismissNote, onConvertToDubie, lang }) {
  const isDanger = tone === 'danger';
  const isWarning = tone === 'warning';
  const background = isDanger ? '#fef2f2' : isWarning ? '#fffbeb' : '#fff';
  const border = isDanger ? '#fecaca' : isWarning ? '#fde68a' : '#ece6d6';
  const title = note.person_name || note.raw_text;
  const canConvertToDubie = note.type === 'dubie' && note.person_name && Number(note.amount || 0) > 0;

  return (
    <div
      className="flex items-center gap-2"
      style={{ padding: '9px 10px', border: `1px solid ${border}`, borderRadius: 10, background }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#1f2937' }}>{title}</p>
          {note.amount ? (
            <span className="text-[11px] font-black flex-shrink-0" style={{ color: isDanger ? '#dc2626' : '#b45309' }}>
              {note.amount} birr
            </span>
          ) : null}
        </div>
        <p className="text-[11px] truncate" style={{ color: '#6b7280' }}>
          {quickNoteTypeLabel(note.type, lang)}
          {note.person_name && note.raw_text ? ` - ${note.raw_text}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onEditNote?.(note)}
        aria-label="Edit note"
        className="press-scale flex items-center justify-center"
        style={{ width: 36, height: 36, borderRadius: 8, background: '#f5f1ea', color: '#374151', flexShrink: 0 }}
      >
        <Pencil className="w-4 h-4" />
      </button>
      {canConvertToDubie && (
        <button
          type="button"
          onClick={() => onConvertToDubie?.(note)}
          aria-label="Convert to Dubie"
          className="press-scale flex items-center justify-center gap-1"
          style={{ minWidth: 76, height: 36, padding: '0 9px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', flexShrink: 0 }}
        >
          <RotateCw className="w-4 h-4" />
          <span className="text-[11px] font-black whitespace-nowrap">To Dubie</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => onDoneNote?.(note)}
        aria-label="Mark done"
        className="press-scale flex items-center justify-center"
        style={{ width: 36, height: 36, borderRadius: 8, background: '#f0fdf4', color: '#047857', flexShrink: 0 }}
      >
        <CheckCircle2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onDismissNote?.(note)}
        aria-label="Dismiss note"
        className="press-scale flex items-center justify-center"
        style={{ width: 36, height: 36, borderRadius: 8, background: '#fef2f2', color: '#dc2626', flexShrink: 0 }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default QuickNotesList;
