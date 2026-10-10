/** Teaching timetable: the staff member's own week, drawn by the same board a
 *  student reads, so a substitution can be checked against what the class sees. */

import { TimetableBoard } from '../../components/TimetableBoard'

export function TeachingTimetablePage() {
  return (
    <TimetableBoard
      guide="teaching"
      kicker="Academics"
      title="Teaching timetable"
      subtitle="The periods you take this week, period by period."
      endpoint="/timetable/mine"
      cacheKey="timetable:mine"
      emptyTitle="No teaching periods yet"
      emptyDetail="Your periods appear here once the department schedules them against the subjects you handle."
    />
  )
}
