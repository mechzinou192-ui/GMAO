// Icônes SVG de l'interface.
import React from "react";

export const Icon=({p,cls})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls||"w-4 h-4"}>{p}</svg>;
export const I={
 menu:<Icon p={<path d="M4 6h16M4 12h16M4 18h16"/>}/>,
 board:<Icon p={<><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>}/>,
 tree:<Icon p={<><circle cx="12" cy="4" r="2"/><circle cx="6" cy="14" r="2"/><circle cx="18" cy="14" r="2"/><path d="M12 6v4M12 10 6 12M12 10l6 2M6 16v4M18 16v4"/></>}/>,
 cal:<Icon p={<><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>}/>,
 store:<Icon p={<><path d="M3 7l2-4h14l2 4M3 7v13h18V7M3 7h18"/><path d="M9 21v-6h6v6"/></>}/>,
 team:<Icon p={<><circle cx="9" cy="7" r="3"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><circle cx="18" cy="8" r="2.5"/><path d="M16 21v-1a4 4 0 0 1 4-4h1"/></>}/>,
 plus:<Icon p={<path d="M12 5v14M5 12h14"/>}/>,
 x:<Icon p={<path d="M18 6 6 18M6 6l12 12"/>}/>,
 alert:<Icon p={<><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></>}/>,
 check:<Icon p={<path d="M20 6 9 17l-5-5"/>}/>,
 chart:<Icon p={<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>}/>,
 flag:<Icon p={<><path d="M4 21V4"/><path d="M4 4h12l-2 4 2 4H4"/></>}/>,
 wrench:<Icon p={<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>}/>,
 gear:<Icon p={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>}/>,
 bell:<Icon cls="w-5 h-5" p={<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></>}/>,
 pin:<Icon p={<><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></>}/>,
 chev:<Icon p={<path d="m6 9 6 6 6-6"/>}/>,
 gauge:<Icon p={<><path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/><circle cx="12" cy="14" r="1.5"/></>}/>,
 home:<Icon p={<><path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></>}/>,
 plus2:<Icon cls="w-6 h-6" p={<path d="M12 5v14M5 12h14"/>}/>,
 logout:<Icon p={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>}/>,
};
