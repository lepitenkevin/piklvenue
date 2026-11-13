import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from './ui/Header';
const inter = Inter({ subsets:['latin'], display:'swap' });
export const metadata: Metadata = { title:'PiklVenue | Find your court. Book your game.', description:'Find and reserve pickleball courts near you.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body className={inter.className}><Header/>{children}<footer className="footer"><div className="shell footflex"><strong>● Pikl<span>Venue</span></strong><span>Find your court. Book your game.</span><span>© {new Date().getFullYear()} PiklVenue</span></div></footer></body></html> }
