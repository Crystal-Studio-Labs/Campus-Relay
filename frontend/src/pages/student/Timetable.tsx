/** My timetable: the student's own week, drawn by the shared timetable board. */

import { TimetableBoard } from '../../components/TimetableBoard'

export function StudentTimetablePage() {
  return (
    <TimetableBoard
      guide="timetable"
      kicker="Academics"
      title="My timetable"
      subtitle="Your classes for the week, period by period."
      endpoint="/timetable/me"
      cacheKey="timetable:me"
      emptyTitle="No timetable published yet"
      emptyDetail="Your week appears here once the department publishes the timetable for your branch and semester."
    />
  )
}
