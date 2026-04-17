import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles.css'
import AppLayout from './ui/AppLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import Interests from './pages/Interests'
import Feed from './pages/Feed'
import Explore from './pages/Explore'
import Commissions from './pages/Commissions'
import Messages from './pages/Messages'
import Profile from './pages/Profile'
import Create from './pages/Create'
import UserProfile from './pages/UserProfile'

const router = createBrowserRouter([
  { path: '/', element: <Login /> },
  { path: '/registro', element: <Register /> },
  { path: '/intereses', element: <Interests /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <Feed /> },
      { path: 'explorar', element: <Explore /> },
      { path: 'comisiones', element: <Commissions /> },
      { path: 'mensajes', element: <Messages /> },
      { path: 'perfil', element: <Profile /> },
      { path: 'perfil/:username', element: <UserProfile /> },
      { path: 'crear', element: <Create /> }
    ]
  }
])

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
