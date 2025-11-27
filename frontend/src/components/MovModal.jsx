import ButtonComponent from "./ButtonComponent";
import InputComponent from "./InputComponent";
import LabelComponent from "./LabelComponent";
import SelectComponent from "./SelectComponent";
import TitleComponent from "./TitleComponent";

function MovModal({mov, saveMov, setMovOpen, setMov}){
    return(
        <div className="fixed top-0 left-0 w-full p-3 h-screen bg-[rgba(0,0,0,0.6)] flex items-center justify-center z-50" onClick={() => setMovOpen(false)}>
            <div className="bg-white rounded-[12px] p-[24px] max-sm:p-[20px] w-[800px] max-h-[80vh] overflow-y-auto shadow-[0px_6px_20px_rgba(0,0,0,0.3)] animate-[popupFade_0.25s_ease]" onClick={(e) => e.stopPropagation()}>
                <TitleComponent text={`Registrar ${mov.tipo === "entrada" ? "Entrada" : "Saida"}`}/>
                <div className="mb-[10px]">
                    <LabelComponent htmlFor={"quantidade"} text={"Quantidade *"}/>
                    <InputComponent idName={"quantidade"} type="number" min="1" value={mov.quantidade} onChange={(e) => setMov((prev) => ({ ...prev, quantidade: e.target.value }))}/>
                </div>
                <div className="mb-[10px]">
                    <LabelComponent htmlFor={"valorFinal"} text={"Valor final (opcional)"}/>
                    <InputComponent idName={"valorFinal"} type="number" step="0.01" value={mov.valor_final} onChange={(e) => setMov((prev) => ({ ...prev, valor_final: e.target.value }))}/>
                </div>
                {mov.tipo === "saida" && (
                <>
                <div className="mb-[10px]">
                    <LabelComponent htmlFor={"pagamento"} text={"Forma de pagamento *"}/>
                    <SelectComponent idName={"pagamento"} value={mov.formaPagamento} onChange={(e) => setMov((prev) => ({ ...prev, formaPagamento: e.target.value, parcelas: e.target.value === "credito" ? prev.parcelas : 1, }))}>
                        <option value="">Selecione...</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="pix">Pix</option>
                        <option value="debito">Débito</option>
                        <option value="credito">Crédito</option>
                    </SelectComponent>
                </div>
                {mov.formaPagamento === "credito" && (
                    <div className="mb-[10px]">
                        <LabelComponent htmlFor={"parcela"} text={"Parcelas"}/>
                        <InputComponent idName={"parcela"} type="number" min="1" max="12" value={mov.parcelas} onChange={(e) => { const value = parseInt(e.target.value || "1", 10); const normalized = Number.isFinite(value) ? Math.max(1, value) : 1; setMov((prev) => ({ ...prev, parcelas: normalized }));}}/>
                    </div>
                )}
                </>
                )}
                <div className="flex justify-end gap-2.5 mt-[20px]">
                    <ButtonComponent onClick={() => setMovOpen(false)} variant={"ghost"} text={"Cancelar"}/>
                    <ButtonComponent onClick={saveMov} variant={"primary"} text={"Salvar"}/>
                </div>
            </div>
        </div>
    )
}

export default MovModal