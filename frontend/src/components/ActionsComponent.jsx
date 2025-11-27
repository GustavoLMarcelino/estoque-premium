import ButtonComponent from "./ButtonComponent";

function ActionsComponent({rowId, position, linhas, onClose, onEdit, onMovimentar, onDelete}){
  const row = linhas.find((x) => x.id === rowId);

  return(
    rowId ? (
      <>
        <div className="fixed inset-0 z-50" onClick={onClose}>
          <div className="fixed flex flex-col bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] min-w-[190px] p-[6px] z-50 top-0 left-0" style={{ top: position.top, left: position.left }} onClick={(e) => e.stopPropagation()}>
            <ButtonComponent onClick={() => { onClose(); if (row) onEdit(row); }} text={"✏️ Editar"} variant={"ghost"}/>
            <ButtonComponent onClick={() => { onClose(); if (row) onMovimentar(row, "entrada");}} variant={"ghost"} text={"⬆️ Entrada"}/>
            <ButtonComponent variant={"ghost"} onClick={() => { onClose(); if (row) onMovimentar(row, "saida");}} text={"⬇️ Saída"}/>
            <hr className="text-[var(--g-border)] my-[6px]"/>
            <ButtonComponent variant={"danger"} onClick={() => { onClose(); onDelete(rowId); }} text={"🗑 Remover"}/>
          </div>
        </div>
      </>
    ) : null
  )
}

export default ActionsComponent