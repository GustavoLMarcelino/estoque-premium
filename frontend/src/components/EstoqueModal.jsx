import ButtonComponent from "./ButtonComponent";
import InputComponent from "./InputComponent";
import LabelComponent from "./LabelComponent";
import TitleComponent from "./TitleComponent";

function EstoqueModal({editOpen, setEditOpen, produtoEdit, setProdutoEdit, saveEdit}){
  if(!editOpen) return null;

  const fields = [
    'nome','modelo','custo','valorVenda','quantidadeMinima','garantia','quantidadeInicial'
  ]

  const isNumberField = (field) => [
    'custo','valorVenda','quantidadeMinima','garantia','quantidadeInicial'
  ].includes(field)

  const formatLabel = (str) => {
    return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^ /, "")
    .replace(/^./, (c) => c.toUpperCase());
  };

  return(
    <div className="fixed top-0 left-0 w-full p-3 h-screen bg-[rgba(0,0,0,0.6)] flex items-center justify-center z-50" onClick={() => setEditOpen(false)}>
      <div className="bg-white rounded-[12px] p-[24px] max-sm:p-[20px] w-[800px] max-h-[80vh] overflow-y-auto shadow-[0px_6px_20px_rgba(0,0,0,0.3)] animate-[popupFade_0.25s_ease]" onClick={(e) => e.stopPropagation()}>
        <TitleComponent text={"Editar Produto"}/>
        {fields.map((field) => (
          <div key={field} className="mb-[12px]">
            <LabelComponent htmlFor={field} text={formatLabel(field)}/>
            <InputComponent idName={field} type={isNumberField(field) ? 'number' : 'text'} value={produtoEdit?.[field] ?? ''} onChange={(e) => setProdutoEdit(prev => ({ ...prev, [field]: e.target.value }))}/>
          </div>
        ))}
        <div className="flex justify-end gap-2.5 mt-[20px]">
          <ButtonComponent onClick={() => setEditOpen(false)} text={"Cancelar"} variant={"ghost"}/>
          <ButtonComponent onClick={saveEdit} text={"Salvar"} variant={"primary"}/>
        </div>
      </div>
    </div>
  )
}

export default EstoqueModal