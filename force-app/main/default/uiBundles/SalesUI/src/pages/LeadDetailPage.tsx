import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Building2, ExternalLink, Mail, Phone, Smartphone } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type { LeadDetail } from '@/api/salesTypes';
import { ActivityPanel } from '@/components/app/ActivityPanel';
import { FormField, NativeSelect, TextArea } from '@/components/app/FormControls';
import {
  BackLink,
  DetailList,
  ErrorState,
  InlineError,
  LoadingBlock,
  PageHeader,
  Section,
  StatusPill,
  salesforceRecordUrl,
} from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useApi } from '@/hooks/useApi';
import { area, date } from '@/lib/format';
import { LEAD_STATUS } from '@/lib/salesLabels';

export default function LeadDetailPage() {
  const { id = '' } = useParams();
  const { data: lead, loading, error, errorInfo, reload, setData } = useApi(() => salesApi.lead(id), [id]);

  return (
    <>
      <BackLink to="/leads">My leads</BackLink>
      {loading && !lead ? (
        <LoadingBlock rows={4} label="Loading lead" />
      ) : error && !lead ? (
        <ErrorState message={error} status={errorInfo?.status} detail={errorInfo?.detail} onRetry={reload} />
      ) : lead ? (
        <>
          <PageHeader
            eyebrow="Lead"
            title={lead.name ?? 'Lead'}
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                <StatusPill tone={LEAD_STATUS[lead.status ?? ''] ?? 'neutral'}>{lead.status}</StatusPill>
                {lead.rating && <StatusPill tone="brand">{lead.rating}</StatusPill>}
                <span>Owner: {lead.isMine ? 'you' : (lead.ownerName ?? '—')}</span>
              </span>
            }
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Section title="Contact">
                <div className="mb-4 flex flex-wrap gap-2">
                  {lead.mobile && (
                    <Button asChild variant="outline" size="lg">
                      <a href={`tel:${lead.mobile}`}>
                        <Smartphone /> {lead.mobile}
                      </a>
                    </Button>
                  )}
                  {lead.phone && (
                    <Button asChild variant="outline" size="lg">
                      <a href={`tel:${lead.phone}`}>
                        <Phone /> {lead.phone}
                      </a>
                    </Button>
                  )}
                  {lead.email && (
                    <Button asChild variant="outline" size="lg">
                      <a href={`mailto:${lead.email}`}>
                        <Mail /> {lead.email}
                      </a>
                    </Button>
                  )}
                </div>
                <DetailList
                  items={[
                    { label: 'City', value: lead.city },
                    { label: 'Nationality', value: lead.nationality },
                    { label: 'Profession', value: lead.profession },
                    { label: 'Source', value: [lead.source, lead.channel].filter(Boolean).join(' · ') || undefined },
                    { label: 'Existing customer (buyer)', value: lead.buyerName },
                    { label: 'Broker', value: lead.brokerName },
                  ]}
                />
              </Section>

              <Section title="Interest">
                <DetailList
                  items={[
                    { label: 'Project of interest', value: lead.projectInterest },
                    { label: 'Second project', value: lead.secondProjectInterest },
                    { label: 'Interested unit', value: lead.interestedUnit },
                    { label: 'Desired area', value: lead.desiredArea ? area(lead.desiredArea) : undefined },
                    { label: 'Sales department', value: lead.salesDepartment },
                    { label: 'Created', value: date(lead.createdDate) },
                  ]}
                />
                <p className="mt-4 text-xs text-muted-foreground">
                  Budget isn't recorded on leads in Salesforce; capture it in the notes if the customer shares it.
                </p>
              </Section>

              <ActivityPanel
                parent="leads"
                parentId={lead.id}
                canEdit={lead.canEdit}
                activities={lead.activities}
                onChange={activities => setData({ ...lead, activities })}
              />
            </div>

            <div className="space-y-6">
              <LeadProgress key={lead.id} lead={lead} onSaved={setData} />
              <ConvertCard lead={lead} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function LeadProgress({ lead, onSaved }: { lead: LeadDetail; onSaved: (l: LeadDetail) => void }) {
  const [status, setStatus] = useState(lead.status ?? '');
  const [rating, setRating] = useState(lead.rating ?? '');
  const [description, setDescription] = useState(lead.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes: { status?: string; rating?: string; description?: string } = {};
  if (lead.canEditStatus && status !== (lead.status ?? '')) changes.status = status;
  if (lead.canEditRating && rating !== (lead.rating ?? '')) changes.rating = rating;
  if (lead.canEditDescription && description !== (lead.description ?? '')) changes.description = description;
  const dirty = Object.keys(changes).length > 0;
  const editable = lead.canEdit && (lead.canEditStatus || lead.canEditRating || lead.canEditDescription);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await salesApi.updateLead(lead.id, changes);
      onSaved(updated);
      toast.success('Lead updated in Salesforce');
    } catch (err) {
      // Salesforce validation messages (e.g. role restrictions on status changes) are shown as-is.
      setError(err instanceof Error ? err.message : 'The lead could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <Section title="Progress">
        <p className="text-sm text-muted-foreground">You can view this lead but your Salesforce access doesn't allow changing it.</p>
      </Section>
    );
  }

  return (
    <Section title="Progress" description="Saved to the lead in Salesforce.">
      <div className="space-y-4">
        {lead.canEditStatus && (
          <FormField label="Lead status">
            {p => (
              <NativeSelect {...p} value={status} onChange={e => setStatus(e.target.value)}>
                {lead.statusOptions.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        )}
        {lead.canEditRating && (
          <FormField label="Rating">
            {p => (
              <NativeSelect {...p} value={rating} onChange={e => setRating(e.target.value)}>
                <option value="">Not rated</option>
                {lead.ratingOptions.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        )}
        {lead.canEditDescription && (
          <FormField label="Notes" hint="Budget, preferences, timing.">
            {p => <TextArea {...p} value={description} onChange={e => setDescription(e.target.value)} rows={5} />}
          </FormField>
        )}
        <InlineError message={error} />
        <Button className="w-full" size="lg" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Section>
  );
}

function ConvertCard({ lead }: { lead: LeadDetail }) {
  const url = salesforceRecordUrl('Lead', lead.id);
  return (
    <Section title="Ready to buy?">
      <Button asChild size="lg" className="mb-3 w-full">
        <Link to={`/units?leadId=${lead.id}`}>
          <Building2 /> Find units{lead.projectInterest ? ` in ${lead.projectInterest}` : ''}
        </Link>
      </Button>
      <p className="text-sm text-muted-foreground">
        EOIs are created on a customer deal. When this lead is qualified, convert it in Salesforce
        {lead.buyerName ? ` into the existing customer ${lead.buyerName}` : ''}. The new deal then appears under Customers.
      </p>
      {url && (
        <Button asChild variant="outline" size="lg" className="mt-3 w-full">
          <a href={url} target="_blank" rel="noreferrer">
            Open lead in Salesforce <ExternalLink />
          </a>
        </Button>
      )}
    </Section>
  );
}
