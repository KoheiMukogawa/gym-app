import { createContext } from 'react'

export const BottomDockContext = createContext<((open: boolean) => void) | null>(null)
