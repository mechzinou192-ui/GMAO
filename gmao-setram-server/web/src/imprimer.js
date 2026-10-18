// Ouvre le document dans une fenêtre et lance l'impression (« Enregistrer au format PDF » dans la boîte de dialogue).
export function imprimerHtml(html){
  const w=window.open("","_blank");
  if(!w){
    window.dispatchEvent(new CustomEvent("gmao:error",{detail:"Impossible d'ouvrir la fenêtre d'impression : autorisez les fenêtres pop-up pour ce site, puis réessayez."}));
    return false;
  }
  w.document.open(); w.document.write(html); w.document.close(); w.focus();
  setTimeout(()=>{ try{ w.print(); }catch{ /* l'utilisateur peut imprimer depuis la fenêtre ouverte */ } },400);
  return true;
}
