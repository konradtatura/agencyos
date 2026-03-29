import { CallsList } from './CallsList'
import { Phone } from 'lucide-react'

export default function CallsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Phone className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[#f9fafb]">My Calls</h1>
          <p className="text-sm text-[#9ca3af]">Booked calls assigned to you</p>
        </div>
      </div>

      <CallsList />
    </div>
  )
}
