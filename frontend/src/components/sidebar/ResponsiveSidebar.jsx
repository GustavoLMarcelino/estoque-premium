import React, { useState, useEffect } from 'react';
import Drawer from '@mui/material/Drawer';
import MenuIcon from '@mui/icons-material/Menu';
import Sidebar from './sidebar';

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
      <button
        className="p-2 text-white fixed top-4 left-4 z-50 bg-black !rounded-lg shadow outline-0"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>

      <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
        <Sidebar onClose={() => setOpen(false)} />
      </Drawer>
    </>
  )
}