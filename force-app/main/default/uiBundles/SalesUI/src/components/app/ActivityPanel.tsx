import { useState, type FormEvent } from 'react';
import { CalendarClock, CheckCircle2, PhoneCall } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { Activity } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import { EmptyState, InlineError, Section, StatusPill } from '@/components/app/Primitives';
import { FormField, TextArea, TextInput } from '@/components/app/FormControls';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { date, daysUntil } from '@/lib/format';

type Mode = 'CALL' | 'FOLLOW_UP';

/** Calls and follow-up tasks on a lead or a customer deal, stored as Salesforce Tasks. */
export function ActivityPanel({
  parent,
  parentId,
  canEdit,
  activities,
  onChange,
}: {
  parent: 'leads' | 'deals';
  parentId: string;
  canEdit: boolean;
  activities: Activity[];
  onChange: (activities: Activity[]) => void;
}) {
  const me = useMe();
  const [mode, setMode] = useState<Mode | null>(null);
  const [subject, setSubject] = useState('');
  const [comments, setComments] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  const open = (m: Mode) => {
    setMode(m);
    setSubject(m === 'CALL' ? 'Call' : 'Follow up');
    setComments('');
    setDueDate('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mode || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await salesApi.addActivity(parent, parentId, {
        kind: mode,
        subject: subject.trim(),
        comments: comments.trim() || undefined,
        dueDate: mode === 'FOLLOW_UP' ? dueDate : undefined,
      });
      onChange(res.activities);
      toast.success(mode === 'CALL' ? 'Call logged in Salesforce' : 'Follow-up scheduled in Salesforce');
      setMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The activity could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const complete = async (a: Activity) => {
    setCompleting(a.id);
    try {
      await salesApi.completeActivity(a.id);
      onChange(activities.map(x => (x.id === a.id ? { ...x, isClosed: true, status: 'Completed' } : x)));
      toast.success('Follow-up marked as done');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the follow-up.');
    } finally {
      setCompleting(null);
    }
  };

  if (!me.activitiesEnabled) {
    return (
      <Section title="Activity">
        <EmptyState icon={<CalendarClock className="size-5" />} title="Activities aren't enabled for you yet">
          Your Salesforce access doesn't include task details (related record and due date), so calls and follow-ups
          can't be shown or logged here. Ask your administrator to enable them.
        </EmptyState>
      </Section>
    );
  }

  return (
    <Section
      title="Activity"
      description="Calls and follow-ups are saved as Salesforce tasks."
      action={
        canEdit && !mode ? (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => open('CALL')}>
              <PhoneCall /> Log call
            </Button>
            <Button variant="outline" size="lg" onClick={() => open('FOLLOW_UP')}>
              <CalendarClock /> Follow-up
            </Button>
          </div>
        ) : undefined
      }
    >
      {mode && (
        <form onSubmit={submit} className="mb-5 space-y-3 rounded-lg border border-border bg-muted/40 p-4" aria-label={mode === 'CALL' ? 'Log a call' : 'Schedule a follow-up'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Subject" required>
              {p => <TextInput {...p} value={subject} onChange={e => setSubject(e.target.value)} maxLength={255} />}
            </FormField>
            {mode === 'FOLLOW_UP' && (
              <FormField label="Due date" required>
                {p => <TextInput {...p} type="date" value={dueDate} min={me.today} onChange={e => setDueDate(e.target.value)} />}
              </FormField>
            )}
          </div>
          <FormField label={mode === 'CALL' ? 'What was discussed' : 'Notes'}>
            {p => <TextArea {...p} value={comments} onChange={e => setComments(e.target.value)} />}
          </FormField>
          <InlineError message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="lg" onClick={() => setMode(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={saving || !subject.trim() || (mode === 'FOLLOW_UP' && !dueDate)}>
              {saving ? 'Saving…' : mode === 'CALL' ? 'Log call' : 'Schedule'}
            </Button>
          </div>
        </form>
      )}
      {activities.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No calls or follow-ups yet.</p>
      ) : (
        <ol className="space-y-3">
          {activities.map(a => {
            const overdue = !a.isClosed && (daysUntil(a.dueDate, me.today) ?? 0) < 0;
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <span className="mt-0.5 text-brand-steel" aria-hidden="true">
                  {a.kind === 'Call' ? <PhoneCall className="size-4" /> : a.isClosed ? <CheckCircle2 className="size-4" /> : <CalendarClock className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-brand-navy">{a.subject}</span>
                    {a.isClosed ? (
                      <StatusPill tone="neutral">Done</StatusPill>
                    ) : (
                      <StatusPill tone={overdue ? 'danger' : 'info'}>{overdue ? 'Overdue' : 'Open'}</StatusPill>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.dueDate ? `Due ${date(a.dueDate)}` : `Created ${date(a.createdDate)}`}
                    {a.ownerName ? ` · ${a.ownerName}` : ''}
                  </div>
                  {a.comments && <p className="mt-1 whitespace-pre-line text-sm">{a.comments}</p>}
                </div>
                {!a.isClosed && canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => complete(a)} disabled={completing === a.id}>
                    {completing === a.id ? 'Saving…' : 'Mark done'}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
