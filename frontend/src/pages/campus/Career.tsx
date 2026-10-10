/** Career: placement postings students can apply to, and the placement desk.
 *
 *  A package is shown only when the posting actually has one: an internship
 *  that pays a stipend shows nothing rather than a fabricated 0 LPA.
 */

import { useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { useRemote } from '../../state/hooks'
import { useLanguage } from '../../lib/i18n'
import { useSession } from '../../state/session'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  SectionTitle,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'

interface JobRow {
  id: number
  company: string
  role: string
  kind: string
  state: string
  description: string | null
  location: string | null
  eligibility: string | null
  package_lpa: number | null
  apply_url: string | null
  deadline: string | null
  applications: number
  posted_at: string | null
}

interface ApplicationRow {
  id: number
  state: string
  applied_at: string | null
  resume_url: string | null
  cover_note: string | null
  note: string | null
  job: { id: number; company: string; role: string; kind: string; deadline: string | null } | null
  student: { id: number; full_name: string; roll_number: string } | null
}

const JOB_KINDS = ['FULL_TIME', 'INTERNSHIP', 'PART_TIME']

const STAGES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED']

const STAGE_TONE: Record<string, 'ghost' | 'progress' | 'warn' | 'done' | 'urgent'> = {
  APPLIED: 'ghost',
  SHORTLISTED: 'progress',
  INTERVIEW: 'warn',
  SELECTED: 'done',
  REJECTED: 'urgent',
  WITHDRAWN: 'ghost',
}

const packageText = (value: number | null, t: (key: string) => string) =>
  value === null ? t('career.stipendNotStated') : `₹${value} LPA`

export function CareerPage() {
  const { t } = useLanguage()
  // Only a student applies. Management may read the board (they hold
  // career:read) but the apply form is not theirs - the server refuses it
  // without career:apply, and a control that always fails is worse than none.
  const { can } = useSession()
  const mayApply = can('career:apply')
  const jobs = useRemote<{ jobs: JobRow[]; count: number }>('career:jobs', (signal) => api.get('/career/jobs', signal))
  const mine = useRemote<{ student: { roll_number: string } | null; applications: ApplicationRow[] }>(
    'career:applications:me',
    (signal) => api.get('/career/applications/me', signal),
  )
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const applied = new Set((mine.data?.applications ?? []).map((application) => application.job?.id))

  const apply = async (job: JobRow) => {
    setBusyId(job.id)
    setError(null)
    setMessage(null)
    try {
      await api.post(`/career/jobs/${job.id}/apply`, { cover_note: note || null })
      setNote('')
      setMessage(`${t('career.appliedTo')} ${job.company} — ${job.role}.`)
      await Promise.all([jobs.refresh(), mine.refresh()])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('career.couldNotApply'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader guide="career-head" title={t('career.title')} subtitle={t('career.subtitle')} kicker={t('career.kicker')} />

      <Card data-guide="career-metrics">
        <div className="grid-3">
          <Metric label={t('career.openPostings')} value={jobs.data?.count ?? 0} />
          <Metric label={t('career.yourApplications')} value={mine.data?.applications.length ?? 0} />
          <Metric
            label={t('career.inPipeline')}
            value={(mine.data?.applications ?? []).filter((a) => a.state !== 'REJECTED' && a.state !== 'WITHDRAWN').length}
            tone="progress"
          />
        </div>
      </Card>

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {(mine.data?.applications ?? []).length > 0 ? (
        <Card>
          <SectionTitle>{t('career.yourApplications')}</SectionTitle>
          <ul className="list-reset stack" style={{ gap: 6 }}>
            {(mine.data?.applications ?? []).map((application) => (
              <li key={application.id} className="row-between wrap small" style={{ gap: 8 }}>
                <span>
                  {application.job?.company} · {application.job?.role}
                </span>
                <Badge tone={STAGE_TONE[application.state] ?? 'ghost'}>{t(`career.stage.${application.state}`)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <SectionTitle>{t('career.openPostings')}</SectionTitle>
      {jobs.loading && !jobs.data ? (
        <LoadingState />
      ) : jobs.error && !jobs.data ? (
        <ErrorState message={jobs.error} onRetry={() => void jobs.refresh()} />
      ) : (jobs.data?.jobs ?? []).length === 0 ? (
        <EmptyState title={t('career.noOpenPostings')} detail={t('career.noOpenPostingsDetail')} />
      ) : (
        (jobs.data?.jobs ?? []).map((job) => (
          <Card key={job.id} data-guide="career-postings">
            <SectionTitle right={<Badge tone="open">{t(`career.kind.${job.kind}`)}</Badge>}>
              {job.company} · {job.role}
            </SectionTitle>
            <div className="tiny muted">
              {job.location ?? t('career.locationNotStated')} · {packageText(job.package_lpa, t)}
              {job.deadline ? ` · ${t('career.applyBy')} ${job.deadline}` : ''}
            </div>
            {job.description ? <p className="small" style={{ marginTop: 6 }}>{job.description}</p> : null}
            {job.eligibility ? <div className="tiny muted">{t('career.eligibility')} {job.eligibility}</div> : null}
            <div style={{ marginTop: 10 }}>
              {!mayApply ? (
                <Badge tone="ghost">{t('career.kind.' + job.kind)}</Badge>
              ) : applied.has(job.id) ? (
                <Badge tone="done">{t('career.alreadyApplied')}</Badge>
              ) : (
                <div className="grid-2" style={{ alignItems: 'end' }}>
                  <label className="field">
                    <span className="field-label">{t('career.coverNote')}</span>
                    <TextArea value={note} onChange={setNote} rows={2} />
                  </label>
                  <div className="field">
                    <Button variant="primary" busy={busyId === job.id} onClick={() => void apply(job)}>
                      {t('career.apply')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))
      )}
    </>
  )
}

export function CareerManagePage() {
  const { t } = useLanguage()
  const state = useRemote<{ jobs: JobRow[]; count: number }>('career:manage', (signal) =>
    api.get('/career/jobs?include_closed=true', signal),
  )
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [kind, setKind] = useState('FULL_TIME')
  const [location, setLocation] = useState('')
  const [pkg, setPkg] = useState('')
  const [deadline, setDeadline] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [applicants, setApplicants] = useState<{ title: string; rows: ApplicationRow[] } | null>(null)

  const publish = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post('/career/jobs', {
        company,
        role,
        kind,
        location: location || null,
        package_lpa: pkg ? Number(pkg) : null,
        deadline: deadline || null,
        description: description || null,
        state: 'OPEN',
      })
      setCompany('')
      setRole('')
      setDescription('')
      setMessage(t('career.published'))
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('career.couldNotPublish'))
    } finally {
      setBusy(false)
    }
  }

  const loadApplicants = async (job: JobRow) => {
    setError(null)
    try {
      const payload = await api.get<{ applications: ApplicationRow[] }>(`/career/jobs/${job.id}/applications`)
      setApplicants({ title: `${job.company} · ${job.role}`, rows: payload.applications })
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('career.couldNotLoadApplicants'))
    }
  }

  const move = async (applicationId: number, next: string) => {
    setError(null)
    try {
      await api.post(`/career/applications/${applicationId}/stage`, { state: next })
      if (applicants) {
        const job = (state.data?.jobs ?? []).find((candidate) => `${candidate.company} · ${candidate.role}` === applicants.title)
        if (job) await loadApplicants(job)
      }
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('career.couldNotMove'))
    }
  }

  return (
    <>
      <PageHeader title={t('career.deskTitle')} subtitle={t('career.deskSubtitle')} kicker={t('career.kicker')} />

      <Card>
        <SectionTitle>{t('career.publishTitle')}</SectionTitle>
        <div className="grid-3">
          <label className="field">
            <span className="field-label">{t('career.company')}</span>
            <TextInput value={company} onChange={setCompany} maxLength={160} />
          </label>
          <label className="field">
            <span className="field-label">{t('career.role')}</span>
            <TextInput value={role} onChange={setRole} maxLength={160} />
          </label>
          <label className="field">
            <span className="field-label">{t('career.type')}</span>
            <Select value={kind} onChange={setKind} options={JOB_KINDS.map((k) => ({ value: k, label: t(`career.kind.${k}`) }))} />
          </label>
        </div>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <label className="field">
            <span className="field-label">{t('career.location')}</span>
            <TextInput value={location} onChange={setLocation} />
          </label>
          <label className="field">
            <span className="field-label">{t('career.package')}</span>
            <TextInput value={pkg} onChange={setPkg} inputMode="numeric" placeholder={t('career.packagePlaceholder')} />
          </label>
          <label className="field">
            <span className="field-label">{t('career.deadline')}</span>
            <TextInput value={deadline} onChange={setDeadline} type="date" />
          </label>
        </div>
        <label className="field" style={{ marginTop: 8 }}>
          <span className="field-label">{t('career.description')}</span>
          <TextArea value={description} onChange={setDescription} rows={2} />
        </label>
        <div style={{ marginTop: 10 }}>
          <Button variant="primary" busy={busy} disabled={!company || !role} onClick={() => void publish()}>
            {t('career.publish')}
          </Button>
        </div>
      </Card>

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {applicants ? (
        <Card>
          <SectionTitle
            right={
              <Button size="sm" variant="ghost" onClick={() => setApplicants(null)}>
                {t('action.close')}
              </Button>
            }
          >
            {t('career.applicantsFor')} {applicants.title}
          </SectionTitle>
          {applicants.rows.length === 0 ? (
            <div className="tiny muted">{t('career.noApplications')}</div>
          ) : (
            <ul className="list-reset stack" style={{ gap: 8 }}>
              {applicants.rows.map((row) => (
                <li key={row.id} className="row-between wrap" style={{ gap: 8 }}>
                  <span className="small">
                    <span className="bold">{row.student?.roll_number}</span> · {row.student?.full_name}
                    <span className="muted"> — {t(`career.stage.${row.state}`)}</span>
                  </span>
                  <div style={{ maxWidth: 170 }}>
                    <Select
                      value={row.state}
                      onChange={(value) => void move(row.id, value)}
                      options={STAGES.map((stage) => ({ value: stage, label: t(`career.stage.${stage}`) }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : (
        (state.data?.jobs ?? []).map((job) => (
          <Card key={job.id}>
            <SectionTitle right={<Badge tone={job.state === 'OPEN' ? 'done' : 'ghost'}>{t(`career.state.${job.state}`)}</Badge>}>
              {job.company} · {job.role}
            </SectionTitle>
            <div className="tiny muted">
              {packageText(job.package_lpa, t)}
              {job.deadline ? ` · ${t('career.deadlineWord')} ${job.deadline}` : ''} · {job.applications}{' '}
              {t('career.appliedCount')}
            </div>
            <div style={{ marginTop: 10 }}>
              <Button size="sm" variant="ghost" onClick={() => void loadApplicants(job)}>
                {t('career.viewApplicants')}
              </Button>
            </div>
          </Card>
        ))
      )}
    </>
  )
}
