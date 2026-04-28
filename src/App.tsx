import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { InboxPage } from '@/pages/InboxPage'
import { NowPage } from '@/pages/NowPage'
import { WaitingPage } from '@/pages/WaitingPage'
import { FollowUpPage } from '@/pages/FollowUpPage'
import { ReviewPage } from '@/pages/ReviewPage'
import { StuckPage } from '@/pages/StuckPage'
import { PeoplePage } from '@/pages/PeoplePage'
import { LoginPage } from '@/pages/LoginPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/now" replace />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="now" element={<NowPage />} />
        <Route path="waiting" element={<WaitingPage />} />
        <Route path="follow-up" element={<FollowUpPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="stuck" element={<StuckPage />} />
        <Route path="people" element={<PeoplePage />} />
      </Route>
    </Routes>
  )
}

export default App
