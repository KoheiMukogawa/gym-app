import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Avatar } from '../profile/Avatar'
import type { Member } from './queries'

const lifts = [{ key: 'squat', name: 'スクワット' }, { key: 'bench', name: 'ベンチプレス' }, { key: 'deadlift', name: 'デッドリフト' }] as const
const kg = (value: number | null) => value === null ? '—' : `${value} kg`

export function MemberDetail({ member, onClose, showHistory = false }: { member: Member; onClose: () => void; showHistory?: boolean }) {
  const title = <span className="flex min-w-0 items-center gap-2 break-words"><Avatar icon={member.icon} name={member.display_name}/> {member.display_name}</span>
  return <BottomSheet title={title} closeLabel="閉じる" onDismiss={onClose}>
    <section className="space-y-4 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" aria-label={`${member.display_name}の記録`}>
      {showHistory && member.bio && <p className="break-words text-sm text-muted">{member.bio}</p>}
      {lifts.map((lift) => {
        const points = member.points.filter((point) => point.lift === lift.key)
        return <div key={lift.key}>
          <div className="flex justify-between text-sm"><span>{lift.name}</span><strong>{kg(member.lifts[lift.key])}</strong></div>
          {showHistory && points.length >= 2 && <div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><XAxis dataKey="date" tick={{ fill: '#8A8A93', fontSize: 10 }} tickFormatter={(date: string) => date.slice(5)} /><YAxis hide domain={['dataMin - 5', 'dataMax + 5']} /><Tooltip contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F' }} formatter={(value) => [`${value} kg`, '推定1RM']} /><Line dataKey="value" stroke="var(--color-accent)" dot={false} /></LineChart></ResponsiveContainer></div>}
        </div>
      })}
    </section>
  </BottomSheet>
}
