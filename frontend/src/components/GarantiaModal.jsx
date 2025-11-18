import ButtonComponent from "./ButtonComponent";
import InputComponent from "./InputComponent";
import LabelComponent from "./LabelComponent";
import SectionComponent from "./SectionComponent";
import SelectComponent from "./SelectComponent";
import TitleComponent from "./TitleComponent";

const toPtBR = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyy_mm_dd)) return yyyy_mm_dd;
  const [y, m, d] = yyyy_mm_dd.split("-");
  return `${d}/${m}/${y}`;
};

function GarantiaModal({selected, editando, form, setCliente, setProduto, setGarantia, handleFiles, handleSave, setSelected}){
    if(!selected) return null;

    return(
        <div className="fixed top-0 left-0 w-full p-3 h-screen bg-[rgba(0,0,0,0.6)] flex items-center justify-center z-50">
          <div className="bg-white rounded-[12px] p-[24px] max-sm:p-[20px] w-[800px] max-h-[80vh] overflow-y-auto shadow-[0px_6px_20px_rgba(0,0,0,0.3)] animate-[popupFade_0.25s_ease]">
            <TitleComponent text={`Garantia #${selected.id} ${editando ? "— Editar" : "— Detalhes"}`}/>

            <SectionComponent title="Dados do Cliente">
              <div className="grid gap-[12px]">
                <LabelComponent htmlFor={"nome"} text={"Nome completo"}/>
                {editando ? (
                  <InputComponent idName={"nome"} value={form.cliente.nome} onChange={(e) => setCliente("nome", e.target.value)}/>
                ) : <p className="max-xl:text-xs font-semibold">{selected.cliente?.nome}</p>}

                <LabelComponent htmlFor={"documento"} text={"CPF/CNPJ"}/>
                {editando ? (
                  <InputComponent idName={"documento"} value={form.cliente.documento} onChange={(e) => setCliente("documento", e.target.value)} />
                ) : <p className="max-xl:text-xs font-semibold">{selected.cliente?.documento}</p>}

                <LabelComponent htmlFor={"telefone"} text={"Telefone"}/>
                {editando ? (
                  <InputComponent idName={"telefone"} value={form.cliente.telefone} onChange={(e) => setCliente("telefone", e.target.value)} />
                ) : <p className="max-xl:text-xs font-semibold">{selected.cliente?.telefone}</p>}

                <LabelComponent htmlFor={"endereco"} text={"Endereço"}/>
                {editando ? (
                  <InputComponent idName={"endereco"} value={form.cliente.endereco} onChange={(e) => setCliente("endereco", e.target.value)} />
                ) : <p className="max-xl:text-xs font-semibold">{selected.cliente?.endereco}</p>}
              </div>
            </SectionComponent>

            <SectionComponent title="Produto e Garantia">
              <div className="grid gap-[12px]">
                <LabelComponent htmlFor={"codigo"} text={"Código"}/>
                {editando ? (
                  <InputComponent idName={"codigo"} value={form.produto.codigo} onChange={(e) => setProduto("codigo", e.target.value)} />
                ) : <p className="max-xl:text-xs font-semibold">{selected.produto?.codigo}</p>}

                <LabelComponent htmlFor={"descricao"} text={"Descrição"}/>
                {editando ? (
                  <InputComponent idName={"descricao"} value={form.produto.descricao} onChange={(e) => setProduto("descricao", e.target.value)} />
                ) : <p className="max-xl:text-xs font-semibold">{selected.produto?.descricao}</p>}

                <LabelComponent htmlFor={"dataCompra"} text={"Data de compra"}/>
                {editando ? (
                  <InputComponent idName={"dataCompra"} type={"date"} value={form.garantia.dataCompra} onChange={(e) => setGarantia("dataCompra", e.target.value)}/>
                ) : <p className="max-xl:text-xs font-semibold">{toPtBR(selected.garantia?.dataCompra)}</p>}

                <LabelComponent htmlFor={"status"} text={"Status"}/>
                {editando ? (
                  <SelectComponent idName={"status"} value={form.garantia.status} onChange={(e) => setGarantia("status", e.target.value)}
                  >
                    <option value="ABERTA">ABERTA</option>
                    <option value="EM_ANALISE">EM_ANALISE</option>
                    <option value="APROVADA">APROVADA</option>
                    <option value="REPROVADA">REPROVADA</option>
                    <option value="FINALIZADA">FINALIZADA</option>
                  </SelectComponent>
                ) : <p className="max-xl:text-xs font-semibold">{selected.garantia?.status}</p>}

                <LabelComponent htmlFor={"descricaoProblema"} text={"Descrição do problema"}/>
                {editando ? (
                  <textarea
                    className="w-full border border-[var(--g-border)] rounded-[10px] p-[8px_10px] !text-base max-xl:!text-xs outline-none resize-y bg-white focus:shadow-[0px_0px_0px_3px_rgba(37,99,235,.15)] focus:border-[#c7d2fe]"
                    value={form.garantia.descricaoProblema}
                    onChange={(e) => setGarantia("descricaoProblema", e.target.value)}
                  />
                ) : <p className="max-xl:text-xs font-semibold">{selected.garantia?.descricaoProblema}</p>}
              </div>
            </SectionComponent>

            <SectionComponent title="Fotos / Anexos">
              {editando ? (
                <>
                  <InputComponent type={"file"} multiple onChange={handleFiles} />
                  {form.garantia.fotos?.length > 0 && (
                    <div className="grid gap-[8px] mt-[8px] grid-cols-4">
                      {form.garantia.fotos.map((url, i) => (
                        <div key={i} className="border border-[var(--g-border)] rounded-[10px] p-[6px_8px] text-[12px] text-[var(--g-muted)] whitespace-nowrap overflow-hidden overflow-ellipsis">{url}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <ul>
                  {(selected.garantia?.fotos || []).map((f, i) => (
                    <li className="max-xl:text-xs font-semibold" key={i}><a href={f} target="_blank" rel="noreferrer">Foto {i + 1}</a></li>
                  ))}
                </ul>
              )}
            </SectionComponent>

            <SectionComponent title="Empréstimo durante a Garantia">
              {selected.emprestimo?.ativo ? (
                <p className="max-xl:text-xs font-semibold">
                  Produto emprestado: <b>{selected.emprestimo.produtoCodigo}</b> — Qtd: {selected.emprestimo.quantidade}
                </p>
              ) : (
                <p className="max-xl:text-xs font-semibold">Nenhum empréstimo registrado.</p>
              )}
            </SectionComponent>

            <div className="flex justify-end mt-[20px] gap-2.5">
              {editando && <ButtonComponent text={"Salvar alterações"} variant={"primary"} onClick={handleSave}/>}
              <ButtonComponent text={"Fechar"} variant="ghost" onClick={() => setSelected(null)}/>
            </div>
          </div>
        </div>
    )
}

export default GarantiaModal