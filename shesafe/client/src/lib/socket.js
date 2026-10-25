import { io } from 'socket.io-client'
import { getToken } from './api'

// Opens a live connection to the backend. The JWT proves who we are.
// Same origin, so Vite's proxy forwards it to the server on port 4000.
export const connectSocket = () => io({ auth: { token: getToken() } })