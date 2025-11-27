import React, { useState, useEffect } from 'react';
import Drawer from '@mui/material/Drawer';
import MenuIcon from '@mui/icons-material/Menu';
import Sidebar from './sidebar';
import logo from '../../assets/LogoSemFundo.png'

export default function ResponsiveSidebar() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isMobile) {
    return <Sidebar />;
  }

  return (
    <>
      <header className="fixed bg-black top-0 left-0 right-0 z-50 text-white">
        <div className='flex items-center justify-between mx-10'>
          <img src={logo} alt="Premium Baterias" className="h-16 w-auto"/>
          <button className="p-2 text-white top-4 left-4 z-50 bg-black !rounded-lg shadow outline-0" onClick={() => setOpen(true)}>
            <MenuIcon />
          </button>
        </div>
      </header>

      <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
        <Sidebar onClose={() => setOpen(false)} />
      </Drawer>
    </>
  )
}